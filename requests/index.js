import { AUTH_TOKEN_KEY } from "@/config";

const DEFAULT_HEADERS = {
  "Content-Type": "application/json",
};

const getTokenHeader = () => {
  try {
    const token = uni.getStorageSync(AUTH_TOKEN_KEY);
    if (!token) return {};
    return {
      Authorization: `Bearer ${token}`,
    };
  } catch (error) {
    return {};
  }
};

const mergeHeaders = (headers) => ({
  ...DEFAULT_HEADERS,
  ...getTokenHeader(),
  ...(headers || {}),
});

const createHttpError = (statusCode, responseData) => {
  const message = typeof responseData?.message === "string"
    ? responseData.message
    : `HTTP ${statusCode}`;
  const error = new Error(message);
  error.statusCode = statusCode;
  error.response = responseData;
  return error;
};

const parseJsonSafely = (text) => {
  if (typeof text !== "string") return text;
  try {
    return JSON.parse(text);
  } catch (error) {
    return text;
  }
};

const unwrapGatewayResponse = (responseData) => {
  if (!responseData || typeof responseData !== "object" || !("body" in responseData)) {
    return {
      statusCode: 0,
      data: responseData,
    };
  }

  return {
    statusCode: Number(responseData.statusCode || 0),
    data: parseJsonSafely(responseData.body),
  };
};

export const request = ({
  url,
  method = "GET",
  data,
  header,
  timeout = 60000,
  unwrapResult = false,
} = {}) => new Promise((resolve, reject) => {
  if (!url) {
    reject(new Error("请求 url 不能为空"));
    return;
  }

  uni.request({
    url,
    method,
    data,
    timeout,
    header: mergeHeaders(header),
    success: (res) => {
      const httpStatusCode = Number(res?.statusCode || 0);
      const { statusCode: gatewayStatusCode, data: unwrappedData } = unwrapGatewayResponse(res?.data);
      const finalStatusCode = gatewayStatusCode || httpStatusCode;

      if (finalStatusCode && finalStatusCode >= 400) {
        reject(createHttpError(finalStatusCode, unwrappedData));
        return;
      }

      if (
        unwrapResult &&
        unwrappedData &&
        typeof unwrappedData === "object" &&
        "result" in unwrappedData
      ) {
        resolve(unwrappedData.result);
        return;
      }

      resolve(unwrappedData);
    },
    fail: (error) => {
      reject(error);
    },
  });
});
