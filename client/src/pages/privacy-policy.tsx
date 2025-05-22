import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function PrivacyPolicy() {
  return (
    <div className="p-6 sm:p-8 lg:p-10 max-w-4xl mx-auto">
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Privacy Policy</h1>
        
        <div className="prose prose-slate max-w-none">
          <p className="text-gray-600 mb-4">Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          
          <h2 className="text-xl font-semibold mt-6 mb-3">Introduction</h2>
          <p>We respect your privacy and are committed to protecting your personal data. This privacy policy will inform you about how we look after your personal data when you visit our website and tell you about your privacy rights and how the law protects you.</p>
          
          <h2 className="text-xl font-semibold mt-6 mb-3">The data we collect</h2>
          <p>We may collect, use, store and transfer different kinds of personal data about you which we have grouped together as follows:</p>
          <ul className="list-disc pl-6 mb-4">
            <li>Identity Data includes your name, username or similar identifier.</li>
            <li>Contact Data includes your email address.</li>
            <li>Technical Data includes browser type and version, time zone setting and location, operating system and platform, and other technology on the devices you use to access this website.</li>
            <li>Usage Data includes information about how you use our website and services.</li>
            <li>Profile Data includes your preferences, feedback, and survey responses.</li>
          </ul>
          
          <h2 className="text-xl font-semibold mt-6 mb-3">How we use your data</h2>
          <p>We will only use your personal data for the purposes for which we collected it, including:</p>
          <ul className="list-disc pl-6 mb-4">
            <li>To register you as a new user</li>
            <li>To provide and improve our services</li>
            <li>To personalize your experience</li>
            <li>To administer and protect our business and website</li>
            <li>To deliver relevant content and advertisements to you</li>
          </ul>
          
          <h2 className="text-xl font-semibold mt-6 mb-3">Data security</h2>
          <p>We have put in place appropriate security measures to prevent your personal data from being accidentally lost, used, or accessed in an unauthorized way, altered, or disclosed. In addition, we limit access to your personal data to those employees, agents, contractors, and other third parties who have a business need to know.</p>
          
          <h2 className="text-xl font-semibold mt-6 mb-3">Data retention</h2>
          <p>We will only retain your personal data for as long as necessary to fulfill the purposes we collected it for, including for the purposes of satisfying any legal, accounting, or reporting requirements.</p>
          
          <h2 className="text-xl font-semibold mt-6 mb-3">Your legal rights</h2>
          <p>Under certain circumstances, you have rights under data protection laws in relation to your personal data, including the right to:</p>
          <ul className="list-disc pl-6 mb-4">
            <li>Request access to your personal data</li>
            <li>Request correction of your personal data</li>
            <li>Request erasure of your personal data</li>
            <li>Object to processing of your personal data</li>
            <li>Request restriction of processing your personal data</li>
            <li>Request transfer of your personal data</li>
            <li>Right to withdraw consent</li>
          </ul>
          
          <h2 className="text-xl font-semibold mt-6 mb-3">Changes to this privacy policy</h2>
          <p>We may update our privacy policy from time to time. We will notify you of any changes by posting the new privacy policy on this page and updating the "Last updated" date at the top of this policy.</p>
          
          <h2 className="text-xl font-semibold mt-6 mb-3">Contact us</h2>
          <p>If you have any questions about this privacy policy or our privacy practices, please contact us.</p>
        </div>
        
        <div className="mt-10">
          <Link href="/">
            <Button variant="outline" className="mr-2">
              Back to Home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}