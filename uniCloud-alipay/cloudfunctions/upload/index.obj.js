'use strict';

module.exports = {
    /**
     * H5 直传云存储会触发浏览器 CORS；由客户端传 base64，云端写入云存储。
     */
    async uploadAvatar(payload = {}) {
        let { base64, cloudPath } = payload;
        if (!base64 || typeof base64 !== 'string') {
            throw new Error('缺少文件数据');
        }

        base64 = base64.trim();
        const dataUrlMatch = /^data:[^;]+;base64,(.+)$/s.exec(base64);
        if (dataUrlMatch) {
            base64 = dataUrlMatch[1];
        }

        let buffer;
        try {
            buffer = Buffer.from(base64, 'base64');
        } catch {
            throw new Error('文件数据无效');
        }

        if (!buffer.length) {
            throw new Error('文件为空');
        }

        const fileName = cloudPath || `avatar/${Date.now()}.jpg`;
        const uploadResult = await uniCloud.uploadFile({
            cloudPath: fileName,
            fileContent: buffer
        });

        if (!uploadResult?.fileID) {
            throw new Error('上传失败');
        }

        const urlResult = await uniCloud.getTempFileURL({
            fileList: [uploadResult.fileID]
        });

        const tempURL = urlResult?.fileList?.[0]?.tempFileURL;

        return {
            fileID: uploadResult.fileID,
            url: tempURL || uploadResult.fileID
        };
    },

    async getUrlByFileId(payload = {}) {
        const fileId = String(payload.fileId ?? payload.fileID ?? '').trim();
        if (!fileId) {
            throw new Error('缺少 fileId');
        }

        const urlResult = await uniCloud.getTempFileURL({
            fileList: [fileId]
        });

        const item = Array.isArray(urlResult.fileList) ? urlResult.fileList[0] : null;
        const tempURL = item?.tempFileURL;

        if (!tempURL) {
            throw new Error(item?.errMsg || item?.message || '获取临时链接失败');
        }

        return {
            fileID: fileId,
            url: tempURL
        };
    }
};
