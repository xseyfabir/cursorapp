import Header from "../components/Header";
import { Suspense } from "react";
import ConnectTwitterClient from "./ConnectTwitterClient";

export default function ConnectTwitterPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-grow container mx-auto px-4 py-12">
        <Suspense
          fallback={
            <div className="max-w-2xl mx-auto">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8">
                <p className="text-gray-600 dark:text-gray-300">Loading...</p>
              </div>
            </div>
          }
        >
          <ConnectTwitterClient />
        </Suspense>
      </main>
    </div>
  );
}
