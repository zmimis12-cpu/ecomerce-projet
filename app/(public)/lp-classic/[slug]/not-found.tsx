export default function LPNotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 text-center px-4" dir="rtl">
      <div className="text-6xl mb-4">😕</div>
      <h1 className="text-2xl font-bold text-gray-800 mb-2">هذه الصفحة غير موجودة</h1>
      <p className="text-gray-500">الرابط الذي تبحث عنه غير متاح أو تم حذفه.</p>
    </div>
  );
}
