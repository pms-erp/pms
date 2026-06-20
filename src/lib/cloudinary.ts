import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function uploadToCloudinary(file: File, folder: string = "tasks") {
  try {
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: `project-management/${folder}`,
          resource_type: "auto",
        },
        (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve({
              url: result?.secure_url,
              public_id: result?.public_id,
              resource_type: result?.resource_type,
            });
          }
        },
      );

      uploadStream.end(buffer);
    });
  } catch (error) {
    console.error("Cloudinary upload error:", error);
    throw error;
  }
}

export async function deleteFromCloudinary(publicId: string) {
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error("Cloudinary delete error:", error);
    throw error;
  }
}
