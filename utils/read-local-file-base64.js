/**
 * 将 uni.chooseImage 等返回的本地路径读为纯 base64（不含 data: 前缀）。
 * H5 多为 blob: URL，小程序/App 走文件系统。
 */
export function readLocalFileAsBase64(filePath) {
  return new Promise((resolve, reject) => {
    if (!filePath) {
      reject(new Error("缺少文件路径"));
      return;
    }

    if (/^(blob:|https?:)/i.test(filePath)) {
      fetch(filePath)
        .then((res) => res.blob())
        .then((blob) => {
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = String(reader.result || "");
            const i = dataUrl.indexOf(",");
            resolve(i >= 0 ? dataUrl.slice(i + 1) : "");
          };
          reader.onerror = () => reject(new Error("读取文件失败"));
          reader.readAsDataURL(blob);
        })
        .catch(() => reject(new Error("读取文件失败")));
      return;
    }

    try {
      uni.getFileSystemManager().readFile({
        filePath,
        encoding: "base64",
        success: (res) => resolve(res.data),
        fail: (err) => reject(new Error(err.errMsg || "读取文件失败")),
      });
    } catch {
      reject(new Error("读取文件失败"));
    }
  });
}
