import Replicate from "replicate";
import fs from "fs";
import path from "path";
import https from "https";
import http from "http";

const replicate = new Replicate({ auth: process.env.REPLICATE_API_KEY });

const UPLOADS_DIR = path.join(__dirname, "../../../data/uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const protocol = url.startsWith("https") ? https : http;
    protocol.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        fs.unlink(dest, () => {});
        downloadFile(response.headers.location!, dest).then(resolve).catch(reject);
        return;
      }
      response.pipe(file);
      file.on("finish", () => file.close(() => resolve()));
    }).on("error", (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

export async function generateCharacterImage(
  characterName: string,
  appearance: string,
  values: string
): Promise<string> {
  const prompt = `Portrait of ${characterName}, ${appearance}. Character values: ${values}. Cinematic film style, detailed character portrait, professional lighting.`;

  const output = await replicate.run("black-forest-labs/flux-schnell", {
    input: {
      prompt,
      num_outputs: 1,
      aspect_ratio: "3:4",
      output_format: "webp",
    },
  });

  const imageUrl = Array.isArray(output) ? output[0] : (output as unknown as string);
  const filename = `char-${Date.now()}.webp`;
  const localPath = path.join(UPLOADS_DIR, filename);
  await downloadFile(String(imageUrl), localPath);

  return `/uploads/${filename}`;
}

export async function generateCharacterVideo(
  imageUrl: string,
  characterName: string
): Promise<string> {
  // Upload the local image file to Replicate so their servers can access it
  const localImagePath = path.join(__dirname, "../../../data", imageUrl);
  const imageBuffer = fs.readFileSync(localImagePath);
  const uploadedFile = await replicate.files.create(
    new Blob([imageBuffer], { type: "image/webp" }),
    { filename: path.basename(localImagePath) }
  );
  const replicateImageUrl = (uploadedFile as unknown as { urls: { get: string } }).urls.get;

  const output = await replicate.run(
    "minimax/video-01-live:7574e16b8f1ad52c6332ecb264c0f132e555f46c222255a738131ec1bb614092",
    {
      input: {
        first_frame_image: replicateImageUrl,
        prompt: `${characterName} portrait, subtle natural movement, gentle breathing, soft ambient light, cinematic`,
      },
    }
  );

  const videoUrl = Array.isArray(output) ? output[0] : (output as unknown as string);
  const filename = `char-video-${Date.now()}.mp4`;
  const localPath = path.join(UPLOADS_DIR, filename);
  await downloadFile(String(videoUrl), localPath);

  return `/uploads/${filename}`;
}
