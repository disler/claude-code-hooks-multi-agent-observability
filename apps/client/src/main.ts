import { createApp } from 'vue'
import './styles/main.css'
import './styles/themes.css'
import App from './App.vue'
import router from './router'

const app = createApp(App)
app.use(router)
app.mount('#app')
