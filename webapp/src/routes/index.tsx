import { Link, createFileRoute } from "@tanstack/react-router";
import { CheckCircleIcon } from "lucide-react";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex-1">
        {/* Hero Section */}
        <section className="w-full py-16 md:py-24 lg:py-32 bg-gradient-to-r from-blue-600 to-purple-700 text-white">
          <div className="container px-4 md:px-6">
            <div className="flex flex-col items-center justify-center text-center space-y-4">
              <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tighter sm:text-5xl xl:text-6xl/none">
                  Supercharge Your Stock-Picking with AI
                </h1>
                <p className="max-w-[700px] text-blue-100 md:text-xl mx-auto">
                  Leverage our cutting-edge AI to analyze market trends, identify promising stocks,
                  and build winning investment strategies.
                </p>
              </div>
              <div className="flex flex-col gap-2 min-[400px]:flex-row">
                <Link
                  to="/dashboard"
                  className="inline-flex h-10 items-center justify-center rounded-md bg-white px-8 text-sm font-medium text-blue-600 shadow transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white disabled:pointer-events-none disabled:opacity-50"
                >
                  Get Started
                </Link>
                <Link
                  to="#features"
                  className="inline-flex h-10 items-center justify-center rounded-md border border-white bg-transparent px-8 text-sm font-medium text-white shadow-sm transition-colors hover:bg-white hover:text-blue-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white disabled:pointer-events-none disabled:opacity-50"
                >
                  Learn More
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="w-full py-8 md:py-16 lg:py-24 bg-gray-50">
          <div className="container px-4 md:px-6">
            <div className="flex flex-col items-center justify-center space-y-4 text-center">
              <div className="space-y-2">
                <div className="inline-block rounded-lg bg-blue-100 px-3 py-1 text-sm font-semibold text-blue-700">
                  Features
                </div>
                <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl">
                  Unlock Your Investment Potential
                </h2>
                <p className="max-w-[900px] text-gray-600 md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
                  Our platform provides a comprehensive suite of features designed to give you an
                  edge in the market.
                </p>
              </div>
            </div>
            <div className="mx-auto grid max-w-5xl items-start gap-8 py-12 sm:grid-cols-2 lg:grid-cols-3">
              <div className="grid gap-1 p-4 bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow">
                <h3 className="text-lg font-bold">AI-Powered Stock Analysis</h3>
                <p className="text-sm text-gray-500">
                  Get intelligent stock recommendations and in-depth market analysis driven by
                  advanced AI algorithms.
                </p>
              </div>
              <div className="grid gap-1 p-4 bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow">
                <h3 className="text-lg font-bold">Customizable Strategy Builder</h3>
                <p className="text-sm text-gray-500">
                  Design, test, and deploy your own unique trading strategies with our intuitive
                  no-code builder.
                </p>
              </div>
              <div className="grid gap-1 p-4 bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow">
                <h3 className="text-lg font-bold">Real-Time Performance Tracking</h3>
                <p className="text-sm text-gray-500">
                  Monitor your portfolio's performance with real-time data and detailed analytics.
                </p>
              </div>
              <div className="grid gap-1 p-4 bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow">
                <h3 className="text-lg font-bold">Automated Prediction Generation</h3>
                <p className="text-sm text-gray-500">
                  Let AI generate stock predictions automatically based on your chosen strategy
                  parameters.
                </p>
              </div>
              <div className="grid gap-1 p-4 bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow">
                <h3 className="text-lg font-bold">Social Trading & Leaderboards</h3>
                <p className="text-sm text-gray-500">
                  Follow top performers, share your strategies, and climb the global leaderboard.
                </p>
              </div>
              <div className="grid gap-1 p-4 bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow">
                <h3 className="text-lg font-bold">Secure & Reliable</h3>
                <p className="text-sm text-gray-500">
                  Your data and strategies are protected with industry-leading security measures.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Benefits Section */}
        <section className="w-full py-8 md:py-16 lg:py-24">
          <div className="container px-4 md:px-6">
            <div className="flex flex-col items-center justify-center space-y-4 text-center">
              <div className="space-y-2">
                <div className="inline-block rounded-lg bg-purple-100 px-3 py-1 text-sm font-semibold text-purple-700">
                  Benefits
                </div>
                <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl">
                  Why Choose StockPicker?
                </h2>
                <p className="max-w-[900px] text-gray-600 md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
                  Experience the advantages of intelligent investing and take control of your
                  financial future.
                </p>
              </div>
            </div>
            <div className="mx-auto grid max-w-5xl items-start gap-8 py-12 sm:grid-cols-1 lg:grid-cols-2">
              <div className="flex items-start gap-4 p-4 bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow">
                <CheckCircleIcon className="h-6 w-6 text-green-500 mt-1" />
                <div>
                  <h3 className="text-lg font-bold">Save Time with Automation</h3>
                  <p className="text-sm text-gray-500">
                    Automate your stock analysis and prediction generation, freeing up your time for
                    other priorities.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4 p-4 bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow">
                <CheckCircleIcon className="h-6 w-6 text-green-500 mt-1" />
                <div>
                  <h3 className="text-lg font-bold">Make Smarter Decisions</h3>
                  <p className="text-sm text-gray-500">
                    Leverage AI-driven insights to make more informed and confident investment
                    choices.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4 p-4 bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow">
                <CheckCircleIcon className="h-6 w-6 text-green-500 mt-1" />
                <div>
                  <h3 className="text-lg font-bold">Reduce Emotional Trading</h3>
                  <p className="text-sm text-gray-500">
                    Rely on data and algorithms, not emotions, to execute your trading strategies
                    consistently.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4 p-4 bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow">
                <CheckCircleIcon className="h-6 w-6 text-green-500 mt-1" />
                <div>
                  <h3 className="text-lg font-bold">Grow Your Portfolio</h3>
                  <p className="text-sm text-gray-500">
                    Utilize powerful tools to identify opportunities and optimize your strategies
                    for better returns.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section className="w-full py-8 md:py-16 lg:py-24 bg-gray-50">
          <div className="container px-4 md:px-6">
            <div className="flex flex-col items-center justify-center space-y-4 text-center">
              <div className="space-y-2">
                <div className="inline-block rounded-lg bg-green-100 px-3 py-1 text-sm font-semibold text-green-700">
                  Pricing
                </div>
                <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl">
                  Simple, Transparent Pricing
                </h2>
                <p className="max-w-[900px] text-gray-600 md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
                  Choose the plan that's right for you and start your journey to smarter investing
                  today.
                </p>
              </div>
            </div>
            <div className="mx-auto grid max-w-5xl items-start gap-8 py-12 sm:grid-cols-1 lg:grid-cols-2">
              {/* Free Plan */}
              <div className="flex flex-col p-6 bg-white rounded-lg shadow-lg transition-shadow hover:shadow-xl border-2 border-transparent hover:border-blue-500">
                <h3 className="text-2xl font-bold">Free</h3>
                <p className="text-gray-500 mt-2">Perfect for getting started</p>
                <div className="mt-4 text-4xl font-bold">
                  $0<span className="text-lg font-normal text-gray-500">/month</span>
                </div>
                <ul className="mt-6 space-y-2 text-gray-600 flex-1">
                  <li className="flex items-center gap-2">
                    <CheckCircleIcon className="h-5 w-5 text-green-500" />
                    Limited AI Analysis
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircleIcon className="h-5 w-5 text-green-500" />1 Active Strategy
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircleIcon className="h-5 w-5 text-green-500" />5 Predictions/month
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircleIcon className="h-5 w-5 text-green-500" />
                    Community Access
                  </li>
                </ul>
                <Link
                  to="/login"
                  className="mt-8 inline-flex h-10 items-center justify-center rounded-md bg-gray-900 px-8 text-sm font-medium text-gray-50 shadow transition-colors hover:bg-gray-900/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-950 disabled:pointer-events-none disabled:opacity-50 dark:bg-gray-50 dark:text-gray-900 dark:hover:bg-gray-50/90 dark:focus-visible:ring-gray-300"
                >
                  Sign Up for Free
                </Link>
              </div>

              {/* Paid Plan */}
              <div className="flex flex-col p-6 bg-white rounded-lg shadow-lg transition-shadow hover:shadow-xl border-2 border-blue-500 relative">
                <h3 className="text-2xl font-bold">Paid</h3>
                <p className="text-gray-500 mt-2">Unlock full potential</p>
                <div className="mt-4 text-4xl font-bold">
                  $5<span className="text-lg font-normal text-gray-500">/month</span>
                </div>
                <ul className="mt-6 space-y-2 text-gray-600 flex-1">
                  <li className="flex items-center gap-2">
                    <CheckCircleIcon className="h-5 w-5 text-green-500" />
                    Unlimited AI Analysis
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircleIcon className="h-5 w-5 text-green-500" />
                    Unlimited Strategies
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircleIcon className="h-5 w-5 text-green-500" />
                    Unlimited Predictions
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircleIcon className="h-5 w-5 text-green-500" />
                    Priority Support
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircleIcon className="h-5 w-5 text-green-500" />
                    Advanced Analytics
                  </li>
                </ul>
                <Link
                  to="/login"
                  className="mt-8 inline-flex h-10 items-center justify-center rounded-md bg-blue-600 px-8 text-sm font-medium text-white shadow transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 disabled:pointer-events-none disabled:opacity-50"
                >
                  Get Started
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
