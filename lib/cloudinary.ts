import { v2 as cloudinary } from 'cloudinary'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

export interface UploadResult {
  url: string
  thumbnail_url: string
  public_id: string
}

const hasCloudinary = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
)

async function uploadLocal(buffer: Buffer, folder: string): Promise<UploadResult> {
  const id = crypto.randomUUID()
  const dir = path.join(process.cwd(), 'public', 'uploads', folder)
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, `${id}.jpg`), buffer)
  const url = `/uploads/${folder}/${id}.jpg`
  return { url, thumbnail_url: url, public_id: id }
}

export async function uploadImage(
  buffer: Buffer,
  folder: string
): Promise<UploadResult> {
  if (!hasCloudinary) return uploadLocal(buffer, folder)
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `fitcheck/${folder}`,
        transformation: [{ quality: 'auto', fetch_format: 'auto' }],
      },
      (err, result) => {
        if (err || !result) return reject(err ?? new Error('Upload failed'))
        const thumbnail_url = cloudinary.url(result.public_id, {
          width: 400,
          height: 400,
          crop: 'fill',
          quality: 'auto',
          fetch_format: 'auto',
        })
        resolve({
          url: result.secure_url,
          thumbnail_url,
          public_id: result.public_id,
        })
      }
    )
    stream.end(buffer)
  })
}
