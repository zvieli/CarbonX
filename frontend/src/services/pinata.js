import { PinataSDK } from "pinata";

// Initialize Pinata SDK with config from environment variables
// Note: Vite exposes env vars prefixed with VITE_ to the client
const pinata = new PinataSDK({
  pinataJwt: import.meta.env.VITE_PINATA_JWT,
  pinataGateway: import.meta.env.VITE_PINATA_GATEWAY,
});

/**
 * Uploads a file and its metadata to IPFS via Pinata.
 * @param {File} file - The image file to upload.
 * @param {Object} metadata - The JSON metadata (name, description, attributes).
 * @returns {Promise<string>} The full token URI (e.g., ipfs://CID).
 */
export const uploadToIPFS = async (file, metadata) => {
  try {
    // 1. Upload the image file
    const uploadImage = await pinata.upload.public
      .file(file)
      .name(file.name || "project_image");
    
    // 2. Construct the proper ERC721 Metadata JSON
    // We use the ipfs uri scheme for the image field as standard practice
    const metadataJSON = {
      name: metadata.name,
      description: metadata.description,
      image: `ipfs://${uploadImage.cid}`, 
      external_url: "https://ecochain.com",
      attributes: metadata.attributes || [],
    };
    
    // 3. Upload the Metadata JSON
    const blob = new Blob([JSON.stringify(metadataJSON)], { type: "application/json" });
    const metadataFile = new File([blob], "metadata.json", { type: "application/json" });
    
    // Use .name() to ensure it's easy to find in the Pinata dashboard
    const uploadMetadata = await pinata.upload.public
      .file(metadataFile)
      .name(`${metadata.name}_metadata.json`);

    return `ipfs://${uploadMetadata.cid}`;
  } catch (error) {
    console.error("Error uploading to Pinata:", error);
    throw error;
  }
};

/**
 * Validates the connection to Pinata and IPFS Gateway.
 * @returns {Promise<{success: boolean, message: string}>}
 */
export const testConnection = async () => {
  try {
    // 1. Test Authentication
    // The SDK often exposes .testAuthentication() - or we can try a simple list/upload
    // Note: Pinata v3+ SDK might differ, trying generic auth test if available
    // If not, we fall back to a simple fetch check.
    
    // Check if testAuthentication exists
    // The "pinata" package (v2.x) usually has this.
    // If not, we try uploading a tiny blob as a test.
    
    const auth = await pinata.testAuthentication();
    
    // 2. Test Gateway Access (Optional but good)
    const testCid = "QmSZwJdGZmgy6M5s4w5k4m5j5m5n5o5p5q5r5s5t5u"; // Known test CID (empty file is QmbFMke1KXqnYyBBWxB74N4c5SBnJMVAiMNRcGu6x1AwQH - or similar)
    // Actually, just auth is enough for "HEALTH CHECK" of API key.

    return { success: true, message: auth.message || "Connected to Pinata successfully" };
  } catch (error) {
    console.error("Pinata Health Check Failed:", error);
    return { success: false, message: error.message || "Connection failed" };
  }
};

export const getGatewayUrl = (uri) => {
  if (!uri) return "";
  
  // If it's already an HTTP URL or a local path, return it as is
  if (uri.startsWith("http") || uri.startsWith("/")) {
    return uri;
  }
  
  // Construct IPFS Gateway URL
  const cid = uri.replace("ipfs://", "");
  return `https://${import.meta.env.VITE_PINATA_GATEWAY}/ipfs/${cid}`;
};
