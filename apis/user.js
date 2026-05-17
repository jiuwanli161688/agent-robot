const userAuthObj = uniCloud.importObject("user-auth");

export const sendEmailCode = (payload) => userAuthObj.sendCode(payload || {});

export const registerByEmail = (payload) => userAuthObj.register(payload || {});

export const loginByEmail = (payload) => userAuthObj.login(payload || {});

export const sendResetPasswordCode = (payload) => userAuthObj.sendResetPasswordCode(payload || {});

export const resetPasswordByEmail = (payload) => userAuthObj.resetPasswordByEmail(payload || {});
