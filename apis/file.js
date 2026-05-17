import { readLocalFileAsBase64 } from "@/utils/read-local-file-base64";

const uploadObj = uniCloud.importObject("upload");

/** 将云存储 fileID（cloud://...）换可为 `<image>` 使用的临时 HTTPS URL */
export const getImageUrlByFileId = (fileId) =>
  uploadObj.getUrlByFileId({ fileId: String(fileId ?? "").trim() });

function isUniAppWeb() {
  try {
    return uni.getSystemInfoSync().uniPlatform === "web";
  } catch {
    return false;
  }
}

// H5 直传云存储会触发 OSS/COS 跨域；Web 走 base64 + 云对象 fileContent，其余端仍本机 uploadFile
export const uploadAvatar = async (tempFilePath, cloudPath) => {
  const path = cloudPath || `avatar/${Date.now()}.jpg`;

  let uploadResult;
  if (isUniAppWeb()) {
    const base64 = await readLocalFileAsBase64(tempFilePath);
    uploadResult = await uploadObj.uploadAvatar({
      base64,
      cloudPath: path,
    });
  } else {
    uploadResult = await uniCloud.uploadFile({
      filePath: tempFilePath,
      cloudPath: path,
    });
  }

  if (!uploadResult?.fileID) {
    throw new Error("上传失败");
  }
  let tempURL = uploadResult.url;
  if (!tempURL) {
    const urlResult = await uniCloud.getTempFileURL({
      fileList: [uploadResult.fileID],
    });
    tempURL = urlResult?.fileList?.[0]?.tempFileURL;
  }
  return {
    fileID: uploadResult.fileID,
    url: tempURL || uploadResult.fileID,
  };
};
