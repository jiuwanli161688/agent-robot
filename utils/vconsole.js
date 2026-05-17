import VConsole from 'vconsole'

// function shouldEnableVConsole() {
// 	if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'development') {
// 		return true
// 	}
// 	// #ifdef H5
// 	if (typeof window !== 'undefined' && window.location && /[?&]vconsole=1(?:&|$)/.test(String(window.location.search || ''))) {
// 		return true
// 	}
// 	// #endif
// 	return false
// }

/**
 * 移动端 / 小程序等场景下的调试面板；开发构建默认开启，H5 可通过 ?vconsole=1 强制开启。
 */
export function initVConsole() {
	// 测试数据 
	// 测试时注释了，正式发版要放开
	// if (!shouldEnableVConsole()) {
	// 	return null
	// }
	return new VConsole()
}
