"use client";

import { Users, PlayCircle,Radio } from "lucide-react";
import Link from "next/link";

export const HomeView = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-4 space-y-12">
      <h1 className="text-4xl md:text-5xl font-bold text-center bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
        Welcome to the world of virtual meetings
      </h1>

      <div className="max-w-3xl w-full">
        <h2 className="text-2xl font-semibold mb-8 text-center">
          Talk with your AI agent in just 3 steps:
        </h2>

        <div className="grid md:grid-cols-3 gap-8">
          <div className="flex flex-col items-center text-center space-y-4 p-6 rounded-lg border border-gray-200 hover:border-purple-400 transition-colors">
            <Radio className="w-12 h-12 text-purple-600" />
            <p className="text-gray-700">
              Go to <Link href="/agents" className="text-red-500">agents</Link> and create an agent with an instruction
            </p>
          </div>

          <div className="flex flex-col items-center text-center space-y-4 p-6 rounded-lg border border-gray-200 hover:border-purple-400 transition-colors">
            <Users className="w-12 h-12 text-purple-600" />
            <p className="text-gray-700">
              Then go to <Link href="/meetings" className="text-red-500">meetings</Link> and select your specified agent
            </p>
          </div>

          <div className="flex flex-col items-center text-center space-y-4 p-6 rounded-lg border border-gray-200 hover:border-purple-400 transition-colors">
            <PlayCircle className="w-12 h-12 text-purple-600" />
            <p className="text-gray-700">
              Start the meeting and get answer to any queries
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
