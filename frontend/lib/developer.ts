// ข้อมูลผู้พัฒนา — แก้ที่ไฟล์นี้ไฟล์เดียว แล้วแท็บ "ผู้พัฒนา" จะอัปเดตเอง
// ไม่ใส่ค่าที่ยังไม่ทราบ (null) ระบบจะซ่อนบรรทัดนั้นให้เอง
export const DEVELOPER = {
  name: null as string | null,        // เช่น "ชื่อ นามสกุล"
  role: null as string | null,        // เช่น "นักพัฒนาระบบ"
  bio: null as string | null,         // ข้อความแนะนำตัวสั้นๆ
  facebookUrl: "https://www.facebook.com/share/1Eqd7MN7t3/",
  facebookLabel: "เพจ Yala Flood Alert บน Facebook",
  phone: null as string | null,       // เช่น "0812345678"
  email: null as string | null,
  line: null as string | null,        // URL ของ LINE เช่น https://line.me/ti/p/xxxx
};

export const APP_INFO = {
  name: "YALA FLOOD ALERT",
  version: "1.0",
  stack: ["Next.js", "FastAPI", "Web Push", "PWA", "Leaflet", "ECharts"],
  credits: [
    "ข้อมูลระดับน้ำ ปริมาณน้ำฝน และกล้อง CCTV: เทศบาลนครยะลา (Yalacity)",
    "ข้อมูลเสริม: ThaiWater (สสน.)",
  ],
};
