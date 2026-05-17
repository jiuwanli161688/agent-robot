import App from './App'

// #ifndef VUE3
import Vue from 'vue'
import './uni.promisify.adaptor'
import { initVConsole } from './utils/vconsole'

initVConsole()
Vue.config.productionTip = false
App.mpType = 'app'
const app = new Vue({
  ...App
})
app.$mount()
// #endif

// #ifdef VUE3
import { createSSRApp } from 'vue'
import { initVConsole } from './utils/vconsole'

export function createApp() {
  initVConsole()
  const app = createSSRApp(App)
  return {
    app
  }
}
// #endif