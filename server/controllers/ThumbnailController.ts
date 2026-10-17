import { Request, Response } from "express";
import Thumbnail from "../models/Thumbnail.js";
import fs from "fs";
import path from "path";
import { v2 as cloudinary } from "cloudinary";

const stylePrompts = {
  "Bold & Graphic": `eye-catching thumbnail, bold typography,
vibrant colors, expressive human face, dramatic lighting,
high contrast, click-worthy composition, professional YouTube style`,

  "Tech/Futuristic": `futuristic thumbnail, sleek modern design,
digital UI elements, glowing accents, holographic effects,
cyber-tech aesthetic, sharp lighting`,

  Minimalist: `minimalist thumbnail, clean layout,
simple shapes, limited colors, strong focal point`,

  Photorealistic: `photorealistic thumbnail, realistic human,
natural lighting, DSLR quality, shallow depth of field`,

  Illustrated: `illustrated thumbnail, digital art,
stylized characters, bold outlines, vibrant colors`,
};

const colorSchemeDescriptions = {
  vibrant: `vibrant, energetic colors, high saturation`,
  sunset: `warm sunset tones, orange pink gradients`,
  forest: `natural green earthy tones`,
  neon: `neon cyberpunk colors, glow effects`,
  purple: `purple and magenta palette`,
  monochrome: `black and white high contrast`,
  ocean: `blue and teal tones`,
  pastel: `soft pastel colors`,
};

// Image sizes for each supported aspect ratio
const sizes: Record<string, { width: number; height: number }> = {
  "16:9": { width: 1024, height: 576 },
  "1:1": { width: 1024, height: 1024 },
  "9:16": { width: 576, height: 1024 },
};

export const generateThumbnail = async (req: Request, res: Response) => {
  let thumbnail: any = null;
  let filePath: string | null = null;

  try {
    const { userId } = req.session;

    const {
      title,
      prompt: user_prompt,
      style,
      aspect_ratio = "16:9",
      color_scheme,
    } = req.body;

    thumbnail = await Thumbnail.create({
      userId,
      title,
      user_prompt,
      style,
      aspect_ratio,
      color_scheme,
      isGenerating: true,
    });

    const styleDescription =
      stylePrompts[style as keyof typeof stylePrompts] ||
      "professional, eye-catching YouTube thumbnail";

    const colorDescription =
      colorSchemeDescriptions[
        color_scheme as keyof typeof colorSchemeDescriptions
      ];

    let prompt = `Create a YouTube thumbnail for "${title}". ${styleDescription}.`;

    if (colorDescription) {
      prompt += ` Use ${colorDescription} color scheme.`;
    }

    if (user_prompt) {
      prompt += ` ${user_prompt}.`;
    }

    prompt += ` Compose a visually stunning ${aspect_ratio} thumbnail.
    Use a strong focal point, professional lighting, and clear composition.`;

    const { width, height } = sizes[aspect_ratio] || sizes["16:9"];

    if (!process.env.CF_ACCOUNT_ID || !process.env.CF_API_TOKEN) {
      throw new Error(
        "Missing CF_ACCOUNT_ID or CF_API_TOKEN in environment variables"
      );
    }

    // Generate image using Cloudflare Workers AI
    const cfResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/ai/run/@cf/stabilityai/stable-diffusion-xl-base-1.0`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.CF_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt, width, height }),
      }
    );

    if (!cfResponse.ok) {
      const errText = await cfResponse.text();
      throw new Error(
        `Cloudflare AI failed (${cfResponse.status}): ${errText}`
      );
    }

    // SDXL on Workers AI returns raw PNG bytes
    const imageBuffer = Buffer.from(await cfResponse.arrayBuffer());

    if (!imageBuffer.length) {
      throw new Error("Cloudflare returned an empty image");
    }

    // Save image temporarily
    const imagesDir = path.join(process.cwd(), "images");
    fs.mkdirSync(imagesDir, { recursive: true });

    const filename = `thumbnail-${Date.now()}.png`;
    filePath = path.join(imagesDir, filename);

    fs.writeFileSync(filePath, imageBuffer);

    // Upload image to Cloudinary
    const uploadResult = await cloudinary.uploader.upload(filePath, {
      resource_type: "image",
    });

    thumbnail.image_url = uploadResult.secure_url;
    thumbnail.isGenerating = false;

    await thumbnail.save();

    return res.json({
      message: "Thumbnail Generated",
      thumbnail,
    });
  } catch (error: any) {
    console.error("Thumbnail generation failed:", error?.message || error);

    if (thumbnail) {
      thumbnail.isGenerating = false;
      await thumbnail.save().catch(console.error);
    }

    return res.status(500).json({
      message: "Image generation failed",
      error: error?.message || "Unknown error",
    });
  } finally {
    // Delete temporary local image
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (cleanupError) {
        console.error("Temporary image cleanup failed:", cleanupError);
      }
    }
  }
};

export const deleteThumbnail = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { userId } = req.session as any;

    const deletedThumbnail = await Thumbnail.findOneAndDelete({
      _id: id,
      userId,
    });

    if (!deletedThumbnail) {
      return res.status(404).json({
        message: "Thumbnail not found",
      });
    }

    return res.json({
      message: "Thumbnail deleted successfully",
    });
  } catch (error: any) {
    console.error(error);

    return res.status(500).json({
      message: error.message,
    });
  }
};


// import { Request, Response } from "express";
// import Thumbnail from "../models/Thumbnail.js";
// import fs from "fs";
// import path from "path";
// import { v2 as cloudinary } from "cloudinary";
// import hf from "../configs/huggingface.js";

// const stylePrompts = {
//   "Bold & Graphic": `eye-catching thumbnail, bold typography,
// vibrant colors, expressive human face, dramatic lighting,
// high contrast, click-worthy composition, professional YouTube style`,

//   "Tech/Futuristic": `futuristic thumbnail, sleek modern design,
// digital UI elements, glowing accents, holographic effects,
// cyber-tech aesthetic, sharp lighting`,

//   Minimalist: `minimalist thumbnail, clean layout,
// simple shapes, limited colors, strong focal point`,

//   Photorealistic: `photorealistic thumbnail, realistic human,
// natural lighting, DSLR quality, shallow depth of field`,

//   Illustrated: `illustrated thumbnail, digital art,
// stylized characters, bold outlines, vibrant colors`,
// };

// const colorSchemeDescriptions = {
//   vibrant: `vibrant, energetic colors, high saturation`,
//   sunset: `warm sunset tones, orange pink gradients`,
//   forest: `natural green earthy tones`,
//   neon: `neon cyberpunk colors, glow effects`,
//   purple: `purple and magenta palette`,
//   monochrome: `black and white high contrast`,
//   ocean: `blue and teal tones`,
//   pastel: `soft pastel colors`,
// };

// export const generateThumbnail = async (
//   req: Request,
//   res: Response
// ) => {
//   let thumbnail: any = null;
//   let filePath: string | null = null;

//   try {
//     const { userId } = req.session;

//     const {
//       title,
//       prompt: user_prompt,
//       style,
//       aspect_ratio = "16:9",
//       color_scheme,
//     } = req.body;

//     thumbnail = await Thumbnail.create({
//       userId,
//       title,
//       user_prompt,
//       style,
//       aspect_ratio,
//       color_scheme,
//       isGenerating: true,
//     });

//     const styleDescription =
//       stylePrompts[style as keyof typeof stylePrompts] ||
//       "professional, eye-catching YouTube thumbnail";

//     const colorDescription =
//       colorSchemeDescriptions[
//         color_scheme as keyof typeof colorSchemeDescriptions
//       ];

//     let prompt = `Create a YouTube thumbnail for "${title}". ${styleDescription}.`;

//     if (colorDescription) {
//       prompt += ` Use ${colorDescription} color scheme.`;
//     }

//     if (user_prompt) {
//       prompt += ` ${user_prompt}.`;
//     }

//     prompt += ` Compose a visually stunning ${aspect_ratio} thumbnail.
//     Use a strong focal point, professional lighting, and clear composition.`;

//     // Generate image using Hugging Face
//     const imageBlob = await hf.textToImage(
//       {
//         provider: "hf-inference",
//         model: "stabilityai/stable-diffusion-xl-base-1.0",
//         inputs: prompt,
//         parameters: {
//           width: 1024,
//           height: 576,
//         },
//       },
//       { outputType: "blob" }
//     );

//     const imageBuffer = Buffer.from(
//         await imageBlob.arrayBuffer()
//     );

//     if (!imageBuffer.length) {
//       throw new Error("Hugging Face returned an empty image");
//     }

//     // Save image temporarily
//     const imagesDir = path.join(process.cwd(), "images");
//     fs.mkdirSync(imagesDir, { recursive: true });

//     const filename = `thumbnail-${Date.now()}.png`;
//     filePath = path.join(imagesDir, filename);

//     fs.writeFileSync(filePath, imageBuffer);

//     // Upload image to Cloudinary
//     const uploadResult = await cloudinary.uploader.upload(
//       filePath,
//       { resource_type: "image" }
//     );

//     thumbnail.image_url = uploadResult.secure_url;
//     thumbnail.isGenerating = false;

//     await thumbnail.save();

//     return res.json({
//       message: "Thumbnail Generated",
//       thumbnail,
//     });
//   } catch (error: any) {
//     console.error(
//       "Thumbnail generation failed:",
//       error?.message || error
//     );

//     if (thumbnail) {
//       thumbnail.isGenerating = false;
//       await thumbnail.save().catch(console.error);
//     }

//     return res.status(500).json({
//       message: "Image generation failed",
//       error: error?.message || "Unknown error",
//     });
//   } finally {
//     // Delete temporary local image
//     if (filePath && fs.existsSync(filePath)) {
//       try {
//         fs.unlinkSync(filePath);
//       } catch (cleanupError) {
//         console.error("Temporary image cleanup failed:", cleanupError);
//       }
//     }
//   }
// };

// export const deleteThumbnail = async (
//   req: Request,
//   res: Response
// ) => {
//   try {
//     const { id } = req.params;
//     const { userId } = req.session as any;

//     const deletedThumbnail = await Thumbnail.findOneAndDelete({
//       _id: id,
//       userId,
//     });

//     if (!deletedThumbnail) {
//       return res.status(404).json({
//         message: "Thumbnail not found",
//       });
//     }

//     return res.json({
//       message: "Thumbnail deleted successfully",
//     });
//   } catch (error: any) {
//     console.error(error);

//     return res.status(500).json({
//       message: error.message,
//     });
//   }
// };


// import { Request, Response } from "express";
// import Thumbnail from "../models/Thumbnail.js";
// import { GenerateContentConfig, HarmBlockThreshold, HarmCategory } from "@google/genai";
// import fs from 'fs'
// import path from "path";
// import {v2 as cloudinary} from 'cloudinary'
// import ai from "../configs/ai.js";
// import hf from "../configs/huggingface.js";


// const stylePrompts = {
//   "Bold & Graphic": `eye-catching thumbnail, bold typography,
// vibrant colors, expressive human face, dramatic lighting,
// high contrast, click-worthy composition, professional YouTube style`,

//   "Tech/Futuristic": `futuristic thumbnail, sleek modern design,
// digital UI elements, glowing accents, holographic effects,
// cyber-tech aesthetic, sharp lighting`,

//   Minimalist: `minimalist thumbnail, clean layout,
// simple shapes, limited colors, strong focal point`,

//   Photorealistic: `photorealistic thumbnail, realistic human,
// natural lighting, DSLR quality, shallow depth of field`,

//   Illustrated: `illustrated thumbnail, digital art,
// stylized characters, bold outlines, vibrant colors`,
// };

// const colorSchemeDescriptions = {
//   vibrant: `vibrant, energetic colors, high saturation`,
//   sunset: `warm sunset tones, orange pink gradients`,
//   forest: `natural green earthy tones`,
//   neon: `neon cyberpunk colors, glow effects`,
//   purple: `purple and magenta palette`,
//   monochrome: `black and white high contrast`,
//   ocean: `blue and teal tones`,
//   pastel: `soft pastel colors`,
// };

// export const generateThumbnail = async (req: Request, res: Response) => {
//   try {
//     const { userId } = req.session;
//     const {
//       title,
//       prompt: user_prompt,
//       style,
//       aspect_ratio = "16:9",
//       color_scheme,
//     } = req.body;

//     const thumbnail = await Thumbnail.create({
//       userId,
//       title,
//       user_prompt,
//       style,
//       aspect_ratio,
//       color_scheme,
//       isGenerating: true,
//     });

//     const model = "gemini-3.1-flash-image";
//     const generationConfig: GenerateContentConfig = {
//       maxOutputTokens: 32768,
//       temperature: 1,
//       topP: 0.95,
//       responseModalities: ["IMAGE"],
//       imageConfig: {
//         aspectRatio: aspect_ratio || "16:9",
//         imageSize: "1K",
//       },
//       safetySettings: [
//         {
//           category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
//           threshold: HarmBlockThreshold.OFF,
//         },
//         {
//           category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
//           threshold: HarmBlockThreshold.OFF,
//         },
//         {
//           category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
//           threshold: HarmBlockThreshold.OFF,
//         },
//         {
//           category: HarmCategory.HARM_CATEGORY_HARASSMENT,
//           threshold: HarmBlockThreshold.OFF,
//         },
//       ],
//     };

//     let prompt = `Create a ${stylePrompts[style as keyof typeof stylePrompts]} for "${title}".`;

//     if (color_scheme) {
//         const colorDescription =
//             colorSchemeDescriptions[
//             color_scheme as keyof typeof colorSchemeDescriptions
//             ];

//         if (colorDescription) {
//             prompt += ` Use ${colorDescription} color scheme.`;
//         }
//     }

//     if (user_prompt) {
//       prompt += ` ${user_prompt}.`;
//     }

//     prompt += `The thumbnail should be ${aspect_ratio}, visually stunning, and designed to maximize click-through 
//     rate . Make it bold, professional, and impossible to ignore.`

//         // Generate the image using the AI model
//     const response = await ai.models.generateContent({
//       model,
//       contents: [prompt],
//       config: generationConfig,
//     });

//         // Check if the response is valid
//     if (!response?.candidates?.[0]?.content?.parts) {
//       throw new Error("Unexpected response");
//     }

//     const parts = response.candidates[0].content.parts;
//     let finalBuffer: Buffer | null = null;

//     for (const part of parts) {
//       if (part.inlineData?.data) {
//         finalBuffer = Buffer.from(part.inlineData.data, "base64");
//       }
//     }

//     if (!finalBuffer) {
//         throw new Error("AI model did not return an image");
//     }

//     const filename = `final-output-${Date.now()}.png`;
//     const filePath = path.join("images", filename);

//     // Create the images directory if it doesn't exist
//     fs.mkdirSync("images", { recursive: true });

//     // Write the final image to the file
//     fs.writeFileSync(filePath, finalBuffer!);

//     const uploadResult = await cloudinary.uploader.upload(filePath, {
//       resource_type: "image",
//     });

//     thumbnail.image_url = uploadResult.url;
//     thumbnail.isGenerating = false;
//     await thumbnail.save();
//     res.json({ message: "Thumbnail Generated", thumbnail });

//     // remove image file from disk
//     fs.unlinkSync(filePath);

//   } catch (error: any) {
//     console.error(error);
//     res.status(500).json({
//       message: "Image generation failed",
//       error: error.message,
//     });
//   }
// };

// export const deleteThumbnail = async (req: Request, res: Response) => {
//   try {
//     const { id } = req.params;
//     const { userId } = req.session as any;

//     await Thumbnail.findOneAndDelete({ _id: id, userId });
//     res.json({ message: "Thumbnail deleted successfully" });
//   } catch (error: any) {
//     console.error(error);
//     res.status(500).json({ message: error.message });
//   }
// };