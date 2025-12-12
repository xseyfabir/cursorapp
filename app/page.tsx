import Header from "./components/Header";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-grow container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          {/* Hero Section */}
          <section className="text-center mb-16">
            <h1 className="text-4xl md:text-6xl font-bold text-gray-900 dark:text-white mb-6">
              Welcome to Next.js
            </h1>
            <p className="text-xl md:text-2xl text-gray-600 dark:text-gray-300 mb-8">
              A modern React framework for production
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="#"
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
              >
                Get Started
              </a>
              <a
                href="#"
                className="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600 transition-colors font-semibold"
              >
                Learn More
              </a>
            </div>
          </section>

          {/* Features Section */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
            <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md">
              <div className="text-4xl mb-4">⚡</div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Fast Refresh
              </h2>
              <p className="text-gray-600 dark:text-gray-300">
                Instant feedback on edits made to your React components.
              </p>
            </div>
            <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md">
              <div className="text-4xl mb-4">🎨</div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Tailwind CSS
              </h2>
              <p className="text-gray-600 dark:text-gray-300">
                Utility-first CSS framework for rapid UI development.
              </p>
            </div>
            <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md">
              <div className="text-4xl mb-4">🔒</div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                TypeScript
              </h2>
              <p className="text-gray-600 dark:text-gray-300">
                Type-safe development with full IDE support.
              </p>
            </div>
          </section>

          {/* Content Section */}
          <section className="prose prose-lg dark:prose-invert max-w-none">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              Getting Started
            </h2>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              This is a Next.js project bootstrapped with TypeScript and Tailwind CSS.
              The project includes a responsive header component and a modern homepage layout.
            </p>
            <p className="text-gray-600 dark:text-gray-300">
              To get started, run <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">npm run dev</code> and
              open <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">http://localhost:3000</code> in your browser.
            </p>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-gray-100 dark:bg-gray-900 py-8 mt-auto">
        <div className="container mx-auto px-4 text-center text-gray-600 dark:text-gray-400">
          <p>&copy; {new Date().getFullYear()} Next.js App. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}





