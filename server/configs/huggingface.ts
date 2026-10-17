
import { InferenceClient } from "@huggingface/inference";

const hf = new InferenceClient(
  process.env.HUGGINGFACE_API_KEY
);

export default hf;
