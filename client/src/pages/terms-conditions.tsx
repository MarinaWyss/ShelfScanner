import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function TermsConditions() {
  return (
    <div className="p-6 sm:p-8 lg:p-10 max-w-4xl mx-auto">
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Terms and Conditions</h1>
        
        <div className="prose prose-slate max-w-none">
          <p className="text-gray-600 mb-4">Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          
          <h2 className="text-xl font-semibold mt-6 mb-3">Introduction</h2>
          <p>These terms and conditions outline the rules and regulations for the use of ShelfScanner's Website.</p>
          <p>By accessing this website, we assume you accept these terms and conditions. Do not continue to use ShelfScanner if you do not agree to take all of the terms and conditions stated on this page.</p>
          
          <h2 className="text-xl font-semibold mt-6 mb-3">License</h2>
          <p>Unless otherwise stated, ShelfScanner and/or its licensors own the intellectual property rights for all material on ShelfScanner. All intellectual property rights are reserved. You may access this from ShelfScanner for your own personal use subjected to restrictions set in these terms and conditions.</p>
          
          <p>You must not:</p>
          <ul className="list-disc pl-6 mb-4">
            <li>Republish material from ShelfScanner</li>
            <li>Sell, rent, or sub-license material from ShelfScanner</li>
            <li>Reproduce, duplicate, or copy material from ShelfScanner</li>
            <li>Redistribute content from ShelfScanner</li>
          </ul>
          
          <h2 className="text-xl font-semibold mt-6 mb-3">User Content</h2>
          <p>In these terms and conditions, "User Content" means material (including without limitation text, images, audio material, video material, and audio-visual material) that you submit to this website, for whatever purpose.</p>
          <p>You grant to ShelfScanner a worldwide, irrevocable, non-exclusive, royalty-free license to use, reproduce, adapt, publish, translate, and distribute your User Content in any existing or future media. You also grant to ShelfScanner the right to sub-license these rights, and the right to bring an action for infringement of these rights.</p>
          
          <h2 className="text-xl font-semibold mt-6 mb-3">Affiliate Links and Advertising</h2>
          <p>This website contains affiliate links and advertising partnerships. We may earn a commission when you purchase products through affiliate links on our site at no additional cost to you.</p>
          <p>We are a participant in the Amazon Services LLC Associates Program and other affiliate advertising programs designed to provide a means for sites to earn advertising fees by advertising and linking to retailers.</p>
          <p>Our affiliate relationships do not influence our editorial content, book recommendations, or user experience. All book recommendations are generated through our proprietary algorithms and AI systems based on your preferences and reading history.</p>
          <p>By using this website, you acknowledge and agree to the presence of affiliate links and understand that we may receive compensation for purchases made through these links.</p>
          
          <h2 className="text-xl font-semibold mt-6 mb-3">Limitation of Liability</h2>
          <p>In no event shall ShelfScanner, nor any of its officers, directors, and employees, be held liable for anything arising out of or in any way connected with your use of this website whether such liability is under contract. ShelfScanner, including its officers, directors, and employees, shall not be held liable for any indirect, consequential, or special liability arising out of or in any way related to your use of this website.</p>
          
          <h2 className="text-xl font-semibold mt-6 mb-3">Indemnification</h2>
          <p>You hereby indemnify to the fullest extent ShelfScanner from and against any and/or all liabilities, costs, demands, causes of action, damages, and expenses arising in any way related to your breach of any of the provisions of these terms.</p>
          
          <h2 className="text-xl font-semibold mt-6 mb-3">Severability</h2>
          <p>If any provision of these terms is found to be invalid under any applicable law, such provisions shall be deleted without affecting the remaining provisions herein.</p>
          
          <h2 className="text-xl font-semibold mt-6 mb-3">Variation of Terms</h2>
          <p>ShelfScanner is permitted to revise these terms at any time as it sees fit, and by using this website you are expected to review these terms on a regular basis.</p>
          
          <h2 className="text-xl font-semibold mt-6 mb-3">Entire Agreement</h2>
          <p>These terms constitute the entire agreement between ShelfScanner and you in relation to your use of this website, and supersede all prior agreements and understandings.</p>
          
          <h2 className="text-xl font-semibold mt-6 mb-3">Governing Law & Jurisdiction</h2>
          <p>These terms will be governed by and interpreted in accordance with the laws of your country of residence, and you submit to the non-exclusive jurisdiction of the state and federal courts for the resolution of any disputes.</p>
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