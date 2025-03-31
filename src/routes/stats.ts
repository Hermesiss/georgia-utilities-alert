import express, { Request, Response } from "express";
import dayjs from "dayjs";
import { OriginalAlert } from "../mongo/originalAlert";

const router = express.Router();

interface CacheEntry {
    data: any;
    timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_DURATION = 60 * 60 * 1000; // 60 minutes in milliseconds

router.get('/street/:street/cities', async (req: Request, res: Response) => {
    const street = req.params.street;
    const cacheKey = `cities_${street}`;
    const cached = cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        return res.json(cached.data);
    }

    const oneYearAgo = dayjs().subtract(1, 'year').toDate();

    try {
        const alerts = await OriginalAlert.find({
            disconnectionArea: { $regex: street, $options: 'i' },
            createdDate: { $gte: oneYearAgo }
        });

        const cityCounts = alerts.reduce((acc, alert) => {
            acc[alert.scName] = (acc[alert.scName] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        const cities = Object.entries(cityCounts)
            .sort(([,a], [,b]) => b - a)
            .map(([name, count]) => ({ name, count }));

        const response = { cities };
        cache.set(cacheKey, { data: response, timestamp: Date.now() });
        res.json(response);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch cities' });
    }
});

router.get('/street/:street/city/:city', async (req: Request, res: Response) => {
    const street = req.params.street;
    const city = req.params.city;
    const cacheKey = `stats_${street}_${city}`;
    const cached = cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        return res.json(cached.data);
    }

    const oneYearAgo = dayjs().subtract(1, 'year').toDate();

    try {
        const alerts = await OriginalAlert.find({
            disconnectionArea: { $regex: street, $options: 'i' },
            scName: city,
            createdDate: { $gte: oneYearAgo }
        }).sort({ disconnectionDate: -1 });

        const total = alerts.length;
        const lastDisconnection = alerts[0]?.disconnectionDate;
        
        const totalAffectedCustomers = alerts.reduce((sum, alert) => {
            const customers = parseInt(alert.scEffectedCustomers || '0') || 0;
            return sum + customers;
        }, 0);
        
        const dailyCounts = alerts.reduce((acc, alert) => {
            const disconnectionDate = dayjs(alert.disconnectionDate);
            const reconnectionDate = alert.reconnectionDate ? dayjs(alert.reconnectionDate) : null;
            
            if (reconnectionDate && !reconnectionDate.isSame(disconnectionDate, 'day')) {
                for (let d = disconnectionDate; d.isBefore(reconnectionDate); d = d.add(1, 'day')) {
                    const dateStr = d.format('YYYY-MM-DD');
                    acc[dateStr] = (acc[dateStr] || 0) + 1;
                }
            } else {
                const dateStr = disconnectionDate.format('YYYY-MM-DD');
                acc[dateStr] = (acc[dateStr] || 0) + 1;
            }
            return acc;
        }, {} as Record<string, number>);

        const startDate = dayjs().subtract(1, 'year');
        const endDate = dayjs();
        const dates: string[] = [];
        const counts: number[] = [];
        
        for (let d = startDate; d.isBefore(endDate); d = d.add(1, 'day')) {
            const dateStr = d.format('YYYY-MM-DD');
            dates.push(dateStr);
            counts.push(dailyCounts[dateStr] || 0);
        }

        const maxDisconnectionsInDay = Math.max(...counts);
        const maxDisconnectionsDate = dates[counts.indexOf(maxDisconnectionsInDay)];

        let currentStreak = 0;
        let maxStreakWithDisconnections = 0;
        let maxStreakWithoutDisconnections = 0;
        let daysWithDisconnections = 0;

        counts.forEach(count => {
            if (count > 0) {
                currentStreak++;
                maxStreakWithDisconnections = Math.max(maxStreakWithDisconnections, currentStreak);
                daysWithDisconnections++;
            } else {
                currentStreak = 0;
            }
        });

        currentStreak = 0;
        counts.forEach(count => {
            if (count === 0) {
                currentStreak++;
                maxStreakWithoutDisconnections = Math.max(maxStreakWithoutDisconnections, currentStreak);
            } else {
                currentStreak = 0;
            }
        });

        const totalDays = counts.length;
        const percentageWithDisconnections = (daysWithDisconnections / totalDays) * 100;
        
        const response = {
            total,
            lastDisconnection,
            dailyData: {
                dates,
                counts
            },
            achievements: {
                maxDisconnectionsInDay,
                maxDisconnectionsDate,
                maxStreakWithDisconnections,
                maxStreakWithoutDisconnections,
                percentageWithDisconnections,
                totalDisconnections: total,
                totalAffectedCustomers
            }
        };
        
        cache.set(cacheKey, { data: response, timestamp: Date.now() });
        res.json(response);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});

export default router; 