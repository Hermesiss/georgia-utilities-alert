import {imgbox} from 'imgbox-js'

export const uploadImage = async (path: string): Promise<string | null> => {
  const res = await imgbox(path)
  console.log('==== UPLOAD IMAGE')
  console.log(res)
  return res.data[0]?.original_url ?? null
}
