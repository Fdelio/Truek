/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FeedItem } from '../types';

export const INITIAL_FEED_ITEMS: FeedItem[] = [
  {
    id: '1',
    title: 'Kit DSLR Profesional',
    category: 'Electrónica',
    type: 'barter',
    distance: 1.2,
    userName: 'Alex Rivers',
    userAvatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuA9Hq4A18-6BAuXlFjg8UIoEulDbAsT10_GDVn23VjG_iter9vvmmtZyCj87OurizZa8GtWR0KLIiAzoI_r6iJGGqQTaY-1QEzWXixp836cjZLEnYMNI76KGJZG0zHou2N3PiDO77uTB-GLCh-6G6V6uWrYOo44v9P1IIq904Z3deYMzOGG6dhCqVg8fUJcO1wnXDUxS_nzVfo2Wr-PhGtxQYp3LxdoiRtrrDv9mupcIwCFIPNTQDwr',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAG5ghcL4UUvTw5_-C2Oegw8sCE76Q4aXymNZ0eZLEjVSm6Pp0KOVKzyZ_vL19TEEJ9ce4bG99IxJT8Z5jCMvgWYAusFe5gvDsSJid2z3dX9lUlAun61f5rnDMD0pFuz_1XErDaXPIEdsMYmjlfSQEPOkvQQam59fjOWx_Nmw-gOPETgi6CIezd2HanpnSgRzYo7J1DZuLKCTdLe4QWY7eXyWz8AZz-U9Zuo7EpHGQQG1eBdm2LnP9W',
    tag: 'RECIÉN PUBLICADO'
  },
  {
    id: '2',
    title: 'Colección Historia del Arte',
    category: 'Libros',
    type: 'donation',
    distance: 3.5,
    userName: 'Sarah Chen',
    userAvatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAABccvEdhCzwaFRnijRkuYlFPrTBZwISIPC5QahiAksf2Kaly0R91IXhEaeqtVjyEumbOYzKbMs0WFzZKdxPFPo__56RsU1u-zykOlLtArM-t22d75VDSVB34k_dGzFcsmfqoCUn-_aqBjjrmGJIogPuPsdmQlh1C22qhQngwsho8XQc8mu1yLefnQo8qIbIjH22RvoPI2aMYcGcQIgWerY1Sk88BNrSBU5Q2YfPqyCqre_7t-lGUi',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCE8WBKQMNx5JIkpS6T0TVX2nFjUsRgDlypH4gAML3pbpBSPz-xCFAFI5McLe6044h-JuNoVohlhbaWYM2emGwFHLq_hLZc9lSsrNlIEGB_fVplc2mn8QGv1C-opChWD89pAPgxgo3fABTn8X06gyUW0Cxr6OTE_BOwxa5CgMNu1QhTedLBZK0glbDaB9GyYgF8yTDZq7v_hXQ3NJIw-LPYRirceiL67_noHdmD68EYmqVKi6lSKW84',
    tag: 'REGALO'
  },
  {
    id: '3',
    title: 'Audífonos Noise Cancel',
    category: 'Electrónica',
    type: 'barter',
    distance: 0.8,
    userName: 'Mark J.',
    userAvatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDQIJNiL9CAAzzzEDUqVgHNYrsIYMGRKkGgIyA0JwtkEDeIMr8031JXWi6Sg0EJSW31nPe1IFsweLZlQ0CaAFKStdjRRLfqGELUox9x15oXYBdEZKwMF2JdZHezlL2aXdQzL8BmsI6QlA3WYI9xMKerJaoAQKIHLPcjzCMwzDmnGp5vrS_XjAGyFYlZ6qYQQLdsSRLjFoTqriY_bnqcqBVExV2zb2FS497qWvZSPHlZ4IKQeBhDXKY0',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAFngMzaIGLZEUSarX-hnWrYbOG-MbJg1vHYfO_8R_87Ki8-M4iMgEbk930nRcp3mwBuRCUw0sbNHDgXEiIYULV2U549Nqs5Krxl8XO47kCkyI6uW_XLnB_gdgaxDM785-18Epvw9z4UVR0TdpeQ37PUS96V3KjVmKZqlgV8bFGHngkOW47SUrFpqSXK9nM1wfvKDWqARqgDvZkva9IVJ8GOQwqus6Se4EG-7Xpf95UORNpPgD34ggn',
    tag: 'Smart Match',
    isSmartMatch: true
  },
  {
    id: '4',
    title: 'Silla Ergonómica Pro',
    category: 'Muebles',
    type: 'barter',
    distance: 12.4,
    userName: 'Clara Ortiz',
    userAvatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAABccvEdhCzwaFRnijRkuYlFPrTBZwISIPC5QahiAksf2Kaly0R91IXhEaeqtVjyEumbOYzKbMs0WFzZKdxPFPo__56RsU1u-zykOlLtArM-t22d75VDSVB34k_dGzFcsmfqoCUn-_aqBjjrmGJIogPuPsdmQlh1C22qhQngwsho8XQc8mu1yLefnQo8qIbIjH22RvoPI2aMYcGcQIgWerY1Sk88BNrSBU5Q2YfPqyCqre_7t-lGUi',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCHTIbtgzbZf2SgIMYJCbc3S4uhLKW7VMiF9GbnjokPvMzkVLHvbH4sP4fbS5EkokaFt6vE_edtHb4at5mOOm_PDLeQmn74TDKCNOvvH5GDfG3ZQnvI2kj2t9GdddHgkUGYbXvvyXUpaIlswz-la0im9nSI69YmArHdfo7FQRBM2v5M6wLibPnHqkAp9pM1IG_P_uKEg3GRRVKQ1k3VuD2d1-l9UJUCjWK0h27P0BOAmWeiQh6MVS0I'
  },
  {
    id: '5',
    title: 'Estera de Yoga Antideslizante',
    category: 'Aire libre',
    type: 'donation',
    distance: 18.1,
    userName: 'Roberto Gómez',
    userAvatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuA9Hq4A18-6BAuXlFjg8UIoEulDbAsT10_GDVn23VjG_iter9vvmmtZyCj87OurizZa8GtWR0KLIiAzoI_r6iJGGqQTaY-1QEzWXixp836cjZLEnYMNI76KGJZG0zHou2N3PiDO77uTB-GLCh-6G6V6uWrYOo44v9P1IIq904Z3deYMzOGG6dhCqVg8fUJcO1wnXDUxS_nzVfo2Wr-PhGtxQYp3LxdoiRtrrDv9mupcIwCFIPNTQDwr',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCCvrX8ETcHm6C-xvWyGp8GpZp2bJUP9i0z5Mry-xmZ6OBwwfXlGAyCHZovFtX8q-Jtqj0oQSClMhQDN7pn-qQSE5H6eNuhycOyd9xLgR-U5sz48tuo-mg1T3ZB7iyI9WrYD1rcG8qwIGIiilsWDFWTuuKfcFuEGyDJnYEvDleP1pp_wCHBSWrPlLKBLQvv6G6IFiTzUi5DBOOBX6ymRUJizDlU_SCBpYh0SvST7k3OPJcTn3oGRWYu'
  }
];

export const INITIAL_INTERESTS: string[] = [
  'Libros',
  'Tecnología',
  'Ropa',
  'Muebles',
  'Servicios',
  'Aire libre'
];
