import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center bg-gradient-to-br from-gray-50 via-white to-brand-50 px-4">
      <div className="text-center max-w-md">
        <p className="text-6xl font-extrabold text-brand-600">404</p>
        <h1 className="mt-4 text-2xl font-bold text-gray-900">Page not found</h1>
        <p className="mt-3 text-gray-600 leading-relaxed">
          The page you&apos;re looking for doesn&apos;t exist, has been moved, or
          you may not have the right permissions to see it.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="px-5 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700"
          >
            Back to Homepage
          </Link>
          <Link
            href="/auth/login"
            className="px-5 py-2.5 bg-white text-gray-800 text-sm font-semibold rounded-xl border border-gray-200 hover:bg-gray-50"
          >
            Log in
          </Link>
          <Link
            href="/auth/register"
            className="px-5 py-2.5 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-100"
          >
            Register
          </Link>
        </div>
      </div>
    </div>
  );
}
