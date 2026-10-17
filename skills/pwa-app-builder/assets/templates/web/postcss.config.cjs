const path = require('path');

/** مسار إعداد Tailwind يُحدَّد صريحاً حتى لا يعتمد على مجلد التشغيل الحالي. */
module.exports = {
  plugins: {
    tailwindcss: { config: path.join(__dirname, 'tailwind.config.cjs') },
    autoprefixer: {},
  },
};
