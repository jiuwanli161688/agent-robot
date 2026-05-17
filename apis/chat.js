import { request } from "@/requests";
import { API_BASE_URL } from "@/config";

// 调取AI接口
// /api/chat 为云函数url配置的path
export const requestChatProxy = (payload) => request({
  url: `${API_BASE_URL}/api/chat`,
  method: "POST",
  data: payload,
  unwrapResult: true,
});
