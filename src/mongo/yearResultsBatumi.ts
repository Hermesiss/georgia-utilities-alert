import mongoose from "mongoose";
import dotenv from "dotenv";
import dayjs from "dayjs";
import fs from "fs";
import path from "path";
import { OriginalAlert, IOriginalAlert } from "./originalAlert";
import { SocarAlert, ISocarAlert } from "./socarAlert";

dotenv.config();

interface YearResults {
  // OriginalAlert metrics
  totalAlerts: number;
  plannedAlerts: number;
  unplannedAlerts: number;
  totalAffectedCustomers: number;
  averageAffectedCustomers: number;
  totalOutageHours: number;
  averageOutageDuration: number;
  longestOutageHours: number;
  shortestOutageHours: number;
  alertsByMonth: Record<string, number>;
  alertsByDayOfWeek: Record<string, number>;
  alertsByDay: Record<string, number>;
  peakMonth: { month: string; count: number };
  peakDayOfWeek: { day: string; count: number };
  alertsWithPhotos: number;
  alertsWithoutPhotos: number;
  deletedAlerts: number;
  activeAlerts: number;
  totalPosts: number;
  averagePostsPerAlert: number;
  mostAffectedRegions: Array<{ region: string; count: number }>;
  
  // SocarAlert metrics
  socarTotalAlerts: number;
  socarTotalAffectedCustomers: number;
  socarAverageAffectedCustomers: number;
  socarTotalOutageHours: number;
  socarAverageOutageDuration: number;
  socarAlertsByMonth: Record<string, number>;
  socarActualAlerts: number;
  socarPendingAlerts: number;
  socarDeactivatedAlerts: number;
  socarNotifiedAlerts: number;
  socarDateChangedAlerts: number;
}

function isBatumiAlert(alert: IOriginalAlert): boolean {
  const batumiGeorgian = "ბათუმი";
  const batumiEnglish = "Batumi";
  const batumiGeorgianGenitive = "ბათუმის"; // genitive case
  
  // Check disconnectionArea (tree structure: comma-separated, each can be "Region/City/District/Street")
  if (alert.disconnectionArea) {
    const areas = alert.disconnectionArea.split(',');
    for (const area of areas) {
      // Check the first part (usually city) and all parts
      const parts = area.split('/').map(p => p.trim());
      for (const part of parts) {
        // Remove quotation marks and check
        const cleaned = part.replace(/[""'«»_`„]+/g, '');
        if (cleaned.includes(batumiGeorgian) || 
            cleaned.includes(batumiGeorgianGenitive) ||
            cleaned.toLowerCase().includes(batumiEnglish.toLowerCase())) {
          return true;
        }
      }
    }
  }
  
  // Check scName (can contain multiple cities separated by "/")
  if (alert.scName) {
    const scNames = alert.scName.split('/').map(n => n.trim());
    for (const name of scNames) {
      if (name.includes(batumiEnglish) || 
          name.includes(batumiGeorgian) || 
          name.includes(batumiGeorgianGenitive)) {
        return true;
      }
    }
  }
  
  // Check supposedCity
  if (alert.supposedCity) {
    if (alert.supposedCity.includes(batumiEnglish) || 
        alert.supposedCity.includes(batumiGeorgian) ||
        alert.supposedCity.includes(batumiGeorgianGenitive)) {
      return true;
    }
  }
  
  return false;
}

function calculateOutageHours(disconnectionDate: string, reconnectionDate?: string): number {
  if (!reconnectionDate) return 0;
  
  try {
    const start = dayjs(disconnectionDate, 'YYYY-MMMM-DD HH:mm');
    const end = dayjs(reconnectionDate, 'YYYY-MMMM-DD HH:mm');
    
    if (!start.isValid() || !end.isValid()) return 0;
    
    return end.diff(start, 'hour', true);
  } catch {
    return 0;
  }
}

async function calculateYearResults(): Promise<YearResults> {
  const mongoConnectString = process.env.MONGODB_CONNECT_STRING;
  
  if (!mongoConnectString) {
    throw new Error("MONGODB_CONNECT_STRING env variable is missing");
  }
  
  await mongoose.connect(mongoConnectString);
  console.log("Connected to MongoDB");
  
  const oneYearAgo = dayjs().subtract(1, 'year').toDate();
  
  // Get total count first
  const totalOriginalAlertsCount = await OriginalAlert.countDocuments({
    createdDate: { $gte: oneYearAgo },
    scName: "ბათუმი",
    posts: { $exists: true, $ne: [] }
  });
  console.log(`\nTotal OriginalAlerts in last year: ${totalOriginalAlertsCount}`);
  
  // Fetch all alerts from the last year in chunks of 100
  const allAlerts: IOriginalAlert[] = [];
  const chunkSize = 100;
  const totalPages = Math.ceil(totalOriginalAlertsCount / chunkSize);
  
  for (let page = 0; page < totalPages; page++) {
    const skip = page * chunkSize;
    const chunk = await OriginalAlert.find({
      createdDate: { $gte: oneYearAgo },
      scName: "ბათუმი",
      posts: { $exists: true, $ne: [] }
    })
      .skip(skip)
      .limit(chunkSize);
    
    allAlerts.push(...chunk);
    console.log(`Loaded OriginalAlerts chunk ${page + 1}/${totalPages} (${chunk.length} alerts, total: ${allAlerts.length})`);
  }
  
  console.log(`Finished loading all OriginalAlerts: ${allAlerts.length}\n`);
  
  // Filter by Batumi
  const batumiAlerts = allAlerts.filter(isBatumiAlert);
  console.log(`Batumi alerts: ${batumiAlerts.length}`);
  
  // Initialize metrics
  const results: YearResults = {
    totalAlerts: batumiAlerts.length,
    plannedAlerts: 0,
    unplannedAlerts: 0,
    totalAffectedCustomers: 0,
    averageAffectedCustomers: 0,
    totalOutageHours: 0,
    averageOutageDuration: 0,
    longestOutageHours: 0,
    shortestOutageHours: Infinity,
    alertsByMonth: {},
    alertsByDayOfWeek: {},
    alertsByDay: {},
    peakMonth: { month: '', count: 0 },
    peakDayOfWeek: { day: '', count: 0 },
    alertsWithPhotos: 0,
    alertsWithoutPhotos: 0,
    deletedAlerts: 0,
    activeAlerts: 0,
    totalPosts: 0,
    averagePostsPerAlert: 0,
    mostAffectedRegions: [],
    socarTotalAlerts: 0,
    socarTotalAffectedCustomers: 0,
    socarAverageAffectedCustomers: 0,
    socarTotalOutageHours: 0,
    socarAverageOutageDuration: 0,
    socarAlertsByMonth: {},
    socarActualAlerts: 0,
    socarPendingAlerts: 0,
    socarDeactivatedAlerts: 0,
    socarNotifiedAlerts: 0,
    socarDateChangedAlerts: 0
  };
  
  const regionCounts = new Map<string, number>();
  const monthCounts = new Map<string, number>();
  const dayOfWeekCounts = new Map<string, number>();
  const dayCounts = new Map<string, number>();
  let validOutageCount = 0;
  
  // Process OriginalAlert metrics
  for (const alert of batumiAlerts) {
    // Planned vs Unplanned
    if (alert.taskType === "1") {
      results.plannedAlerts++;
    } else {
      results.unplannedAlerts++;
    }
    
    // Affected customers
    const customers = parseInt(alert.scEffectedCustomers || '0') || 0;
    results.totalAffectedCustomers += customers;
    
    // Outage duration
    const hours = calculateOutageHours(alert.disconnectionDate, alert.reconnectionDate);
    if (hours >= 0) {
      results.totalOutageHours += hours;
      validOutageCount++;
      if (hours > results.longestOutageHours) {
        results.longestOutageHours = hours;
      }
      if (hours < results.shortestOutageHours && hours > 0) {
        results.shortestOutageHours = hours;
      }
    }
    
    // Posts
    const postCount = alert.posts?.length || 0;
    results.totalPosts += postCount;
    const hasPhoto = alert.posts?.some(p => p.hasPhoto) || false;
    if (hasPhoto) {
      results.alertsWithPhotos++;
    } else {
      results.alertsWithoutPhotos++;
    }
    
    // Deleted alerts
    if (alert.deletedDate) {
      results.deletedAlerts++;
    } else {
      results.activeAlerts++;
    }
    
    // Region counts
    const region = alert.regionName || 'Unknown';
    regionCounts.set(region, (regionCounts.get(region) || 0) + 1);
    
    // Month counts
    try {
      const date = dayjs(alert.disconnectionDate, 'YYYY-MMMM-DD HH:mm');
      if (date.isValid()) {
        const monthKey = date.format('YYYY-MM');
        monthCounts.set(monthKey, (monthCounts.get(monthKey) || 0) + 1);
        
        const dayOfWeek = date.format('dddd');
        dayOfWeekCounts.set(dayOfWeek, (dayOfWeekCounts.get(dayOfWeek) || 0) + 1);
        
        const dayKey = date.format('YYYY-MM-DD');
        dayCounts.set(dayKey, (dayCounts.get(dayKey) || 0) + 1);
      }
    } catch (e) {
      // Skip invalid dates
    }
  }
  
  // Calculate averages
  if (batumiAlerts.length > 0) {
    results.averageAffectedCustomers = results.totalAffectedCustomers / batumiAlerts.length;
    results.averagePostsPerAlert = results.totalPosts / batumiAlerts.length;
  }
  if (validOutageCount > 0) {
    results.averageOutageDuration = results.totalOutageHours / validOutageCount;
  }
  
  if (results.shortestOutageHours === Infinity) {
    results.shortestOutageHours = 0;
  }
  
  // Convert maps to objects
  results.alertsByMonth = Object.fromEntries(monthCounts);
  results.alertsByDayOfWeek = Object.fromEntries(dayOfWeekCounts);
  results.alertsByDay = Object.fromEntries(dayCounts);

  // Find peak month
  for (const [month, count] of monthCounts) {
    if (count > results.peakMonth.count) {
      results.peakMonth = { month, count };
    }
  }

  // Find peak day of week
  for (const [day, count] of dayOfWeekCounts) {
    if (count > results.peakDayOfWeek.count) {
      results.peakDayOfWeek = { day, count };
    }
  }

  // Find top 10 most affected regions
  const sortedRegions = Array.from(regionCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([region, count]) => ({ region, count }));
  results.mostAffectedRegions = sortedRegions;
  
  // Process SocarAlert metrics
  const oneYearAgoDate = dayjs().subtract(1, 'year').toDate();
  
  // Get total count first
  const totalSocarAlertsCount = await SocarAlert.countDocuments({
    created: { $gte: oneYearAgoDate },
    title: { $regex: "ბათუმი", $options: "i" }
  });
  console.log(`\nTotal SocarAlerts in last year: ${totalSocarAlertsCount}`);
  
  // Fetch all SocarAlerts from the last year in chunks of 100
  const allSocarAlerts: ISocarAlert[] = [];
  const socarChunkSize = 100;
  const totalSocarPages = Math.ceil(totalSocarAlertsCount / socarChunkSize);
  
  for (let page = 0; page < totalSocarPages; page++) {
    const skip = page * socarChunkSize;
    const chunk = await SocarAlert.find({
      created: { $gte: oneYearAgoDate },
      title: { $regex: "ბათუმი", $options: "i" }
    })
      .skip(skip)
      .limit(socarChunkSize);
    
    allSocarAlerts.push(...chunk);
    console.log(`Loaded SocarAlerts chunk ${page + 1}/${totalSocarPages} (${chunk.length} alerts, total: ${allSocarAlerts.length})`);
  }
  
  console.log(`Finished loading all SocarAlerts: ${allSocarAlerts.length}\n`);
  
  const batumiSocarAlerts = allSocarAlerts.filter(alert => {
    try {
      return alert.isCity('ბათუმის') || alert.isCity('ბათუმი');
    } catch {
      return false;
    }
  });
  
  console.log(`Batumi Socar alerts: ${batumiSocarAlerts.length}`);
  
  results.socarTotalAlerts = batumiSocarAlerts.length;
  const socarMonthCounts = new Map<string, number>();
  let validSocarOutageCount = 0;
  
  for (const alert of batumiSocarAlerts) {
    results.socarTotalAffectedCustomers += alert.affectedCustomers || 0;
    
    const hours = dayjs(alert.end).diff(dayjs(alert.start), 'hour', true);
    if (hours >= 0) {
      results.socarTotalOutageHours += hours;
      validSocarOutageCount++;
    }
    
    if (alert.isActual()) {
      results.socarActualAlerts++;
    }
    if (alert.isPending) {
      results.socarPendingAlerts++;
    }
    if (alert.isDeactivated) {
      results.socarDeactivatedAlerts++;
    }
    if (alert.isNotified) {
      results.socarNotifiedAlerts++;
    }
    if (alert.dateChanged) {
      results.socarDateChangedAlerts++;
    }
    
    // Month counts
    const monthKey = dayjs(alert.start).format('YYYY-MM');
    socarMonthCounts.set(monthKey, (socarMonthCounts.get(monthKey) || 0) + 1);
  }
  
  if (batumiSocarAlerts.length > 0) {
    results.socarAverageAffectedCustomers = results.socarTotalAffectedCustomers / batumiSocarAlerts.length;
  }
  if (validSocarOutageCount > 0) {
    results.socarAverageOutageDuration = results.socarTotalOutageHours / validSocarOutageCount;
  }
  
  results.socarAlertsByMonth = Object.fromEntries(socarMonthCounts);
  
  await mongoose.disconnect();
  console.log("Disconnected from MongoDB");
  
  return results;
}

async function main() {
  try {
    const results = await calculateYearResults();
    
    // Save results to JSON file
    const outputPath = path.join(process.cwd(), 'year-results-batumi.json');
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf-8');
    console.log(`\nResults saved to: ${outputPath}\n`);
    
    process.exit(0);
  } catch (error) {
    console.error("Error calculating year results:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { calculateYearResults, isBatumiAlert };

