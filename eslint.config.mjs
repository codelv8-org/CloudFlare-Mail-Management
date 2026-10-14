import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // กำหนดโฟลเดอร์ที่ไม่ต้องตรวจเพิ่มเติมจากค่าเริ่มต้นของ Next.js
  globalIgnores([
    // โฟลเดอร์ที่สร้างโดยเครื่องมือ build
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    files: ["components/ui/**/*.{ts,tsx}", "hooks/use-mobile.ts"],
    rules: {
      // คง source ของ component ที่นำเข้าจาก shadcn และตรวจโค้ดแอปด้วยกฎที่เข้มกว่า
      "@typescript-eslint/no-unused-vars": "off",
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    files: ["ecosystem.config.cjs"],
    rules: {
      // PM2 อ่าน configuration นี้ในรูปแบบ CommonJS
      "@typescript-eslint/no-require-imports": "off",
    },
  },
]);

export default eslintConfig;
