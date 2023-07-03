import {getAllMatches, hasIntersection, prepare} from "../../src/map/matcher";

describe('crossroads', () => {
  const intersected = [
    {input: "ლერმონტოვისა და გორგილაძის კვეთა", output: ["ლერმონტოვის ქუჩა", "ზურაბ გორგილაძის ქუჩა"]}, //memed
  ]

  prepare()

  for (let datum of intersected) {
    it("matching " + datum.input, () => {
      console.log(datum.input)
      const intersection = hasIntersection(datum.input)
      expect(intersection.result).toEqual(true)
      expect(intersection.street1).not.toEqual(undefined)
      expect(intersection.street2).not.toEqual(undefined)

      if (!intersection.street1 || !intersection.street2) {
        throw new Error("intersection.street1 || intersection.street2 is undefined")
      }

      let match = getAllMatches(intersection.street1, null)
      expect(match[0].street.name).toEqual(datum.output[0])
      console.log(match[0].street.name)
      match = getAllMatches(intersection.street2, null)
      expect(match[0].street.name).toEqual(datum.output[1])
    })
  }
})

describe('matching', () => {
  const data = [
    {input: "მ აბაშიძის", output: "მემედ აბაშიძის გამზირი"}, //memed
    {input: "მ. აბაშიძის", output: "მემედ აბაშიძის გამზირი"},
    {input: "მემედ აბაშიძის", output: "მემედ აბაშიძის გამზირი"},
    {input: "მე აბაშიძის", output: "მემედ აბაშიძის გამზირი"},
    {input: "ი აბაშიძის", output: "ირაკლი აბაშიძის ქუჩა"}, // irakli
    {input: "ი. აბაშიძის", output: "ირაკლი აბაშიძის ქუჩა"},
    {input: "ი. აბაშიძის", output: "ირაკლი აბაშიძის ქუჩა"},
    {input: "გენ ა.აბაშიძის", output: "გენერალ ასლან აბაშიძის ქუჩა"}, // general aslan
    {input: "გენერალ ასლან აბაშიძის", output: "გენერალ ასლან აბაშიძის ქუჩა"},
    {input: "გ აბაშიძის", output: "გენერალ ასლან აბაშიძის ქუჩა"},
    {input: "ა აბაშიძის", output: "გენერალ ასლან აბაშიძის ქუჩა"},
    {input: "ა. აბაშიძის", output: "გენერალ ასლან აბაშიძის ქუჩა"},
    {input: "ჰ აბაშიძის", output: "ჰაიდარ აბაშიძის ქუჩა"}, // haidar
  ]
  prepare()

  for (let datum of data) {
    it("matching " + datum.input, () => {
      console.log(datum.input)
      const match = getAllMatches(datum.input, null)
      expect(match[0].street.name).toEqual(datum.output)
    })
  }
})
