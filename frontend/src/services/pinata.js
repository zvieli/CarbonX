import { PinataSDK } from "pinata";

// Initialize Pinata SDK with config from environment variables
const pinata = new PinataSDK({
  pinataJwt: import.meta.env.PINATA_JWT,
  pinataGateway: import.meta.env.PINATA_GATEWAY,
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

export const getGatewayUrl = (ipfsUri) => {
  if (!ipfsUri) return "";
  const cid = ipfsUri.replace("ipfs://", "");
  return `https://${import.meta.env.PINATA_GATEWAY}/ipfs/${cid}`;
};
