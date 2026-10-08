/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  outputFileTracingIncludes: {
    "/api/quotations/*/pdf": ["./public/fonts/NotoSans-Regular.ttf"],
    "/api/quotations/*/send": ["./public/fonts/NotoSans-Regular.ttf"],
    "/api/quotations/preview": ["./public/fonts/NotoSans-Regular.ttf"],
    "/api/invoices/*/pdf": ["./public/fonts/NotoSans-Regular.ttf"],
    "/api/invoices/*/send": ["./public/fonts/NotoSans-Regular.ttf"],
    "/api/invoices/preview": ["./public/fonts/NotoSans-Regular.ttf"],
  },
  experimental: {
    authInterrupts: true,
  },
};

export default nextConfig;
