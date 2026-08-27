import { configure } from 'quasar/wrappers';

export default configure(() => ({
  boot: [],
  css: ['app.scss'],
  extras: ['material-icons'],
  build: { vueRouterMode: 'history' },
  devServer: { port: 9001, strictPort: true, open: false },
  framework: { config: {}, plugins: ['Notify'] }
}));
