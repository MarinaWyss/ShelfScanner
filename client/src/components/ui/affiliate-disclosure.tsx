import { Info } from "lucide-react";

interface AffiliateDisclosureProps {
  className?: string;
}

export default function AffiliateDisclosure({ className = "" }: AffiliateDisclosureProps) {
  return (
    <div className={`bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 ${className}`}>
      <div className="flex items-start space-x-3">
        <Info className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
        <div className="text-sm text-blue-800">
          <p>
            This page contains affiliate links. We may earn a small commission if you purchase through these links at no additional cost to you. This helps us pay to keep the site up and free for users! &lt;3
          </p>
        </div>
      </div>
    </div>
  );
}