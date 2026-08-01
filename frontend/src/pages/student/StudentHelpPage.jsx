/**
 * StudentHelpPage — FAQ and help documentation for students.
 * Covers risk scores, AI tutor, SOS, attendance, and materials.
 */
import { useState } from "react";
import {
  ChevronDown, HelpCircle, Activity, AlertTriangle,
  MessageSquare, Bell, QrCode, FileText,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

function Section({ icon: Icon, title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left font-semibold text-slate-800 hover:bg-slate-50 transition-colors"
      >
        <Icon className="w-5 h-5 text-gold-600 shrink-0" />
        <span className="flex-1">{title}</span>
        <ChevronDown
          className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 text-sm text-slate-600 leading-relaxed space-y-3">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function StudentHelpPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-gold-100 rounded-lg">
          <HelpCircle className="w-6 h-6 text-gold-700" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Help &amp; FAQ</h1>
          <p className="text-sm text-slate-500">Answers to common questions about the system</p>
        </div>
      </div>

      {/* FAQ Sections */}
      <div className="space-y-3">
        <Section icon={Activity} title="How Your Risk Score Is Calculated" defaultOpen>
          <p>
            Your risk score is a percentage (0&ndash;100%) representing the probability that you will
            end this semester with an SGPA below 2.0.
          </p>
          <p>
            It is calculated weekly from <strong>19 signals</strong>: attendance rate, quiz average,
            assignment submission rate, mood check-in, login frequency, consecutive absences, SGPA,
            chat engagement, submission timing, plus 9 additional behavioural signals.
          </p>
          <p>
            The model shows your <strong>top 7 factors</strong> on the Engagement page under
            &quot;Key Factors Affecting Your Progress&quot;.
          </p>
        </Section>

        <Section icon={AlertTriangle} title="What High / Medium / Low Means">
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <span className="inline-block w-3 h-3 mt-1 rounded-full bg-green-500 shrink-0" />
              <p>
                <strong>Low (0&ndash;40%):</strong> You are on track. Keep attending classes and
                submitting work on time.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <span className="inline-block w-3 h-3 mt-1 rounded-full bg-amber-500 shrink-0" />
              <p>
                <strong>Medium (40&ndash;70%):</strong> Some signals are concerning. Read your
                intervention message carefully and follow the suggestions.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <span className="inline-block w-3 h-3 mt-1 rounded-full bg-red-500 shrink-0" />
              <p>
                <strong>High (70&ndash;100%):</strong> Immediate action is recommended. Consider
                booking office hours with your lecturer or advisor.
              </p>
            </div>
          </div>
        </Section>

        <Section icon={MessageSquare} title="How to Use the AI Tutor">
          <p>
            Navigate to <strong>Course Tutor</strong> in the sidebar, select your course, then type
            your question.
          </p>
          <p>
            The tutor uses your uploaded course materials to provide relevant answers. It does{" "}
            <strong>not</strong> know your risk score &mdash; it is a learning tool, not a monitoring
            tool.
          </p>
        </Section>

        <Section icon={Bell} title="How to Use the SOS Button">
          <ul className="list-disc pl-5 space-y-1">
            <li>Sends an alert to the right support staff based on category — your course lecturer for academic issues, or welfare/admin staff for financial, emotional, or health concerns.</li>
            <li>
              Select a category: <strong>academic</strong>, <strong>financial</strong>,{" "}
              <strong>emotional</strong>, or <strong>health</strong>.
            </li>
            <li>You can send up to <strong>3 SOS alerts per day</strong>.</li>
            <li>
              Your SOS is <strong>private</strong> &mdash; only the relevant staff can see it. Other students cannot.
            </li>
          </ul>
        </Section>

        <Section icon={QrCode} title="How QR Attendance Works">
          <ul className="list-disc pl-5 space-y-1">
            <li>When a lecturer opens an attendance session, a notification appears.</li>
            <li>Scan the QR code displayed on the projector, or type the 6-character code manually.</li>
            <li>
              There is a time limit set by the lecturer (usually 30 minutes).
            </li>
            <li>You can only mark attendance once per session.</li>
          </ul>
        </Section>

        <Section icon={FileText} title="Why Is My Material Not Showing?">
          <ul className="list-disc pl-5 space-y-1">
            <li>Check that you have the correct course selected.</li>
            <li>
              Materials appear via notification when uploaded by your lecturer. Click the toast
              notification or refresh the Materials page.
            </li>
            <li>
              If the material was uploaded before you enrolled, it should still appear once you
              refresh the page.
            </li>
          </ul>
        </Section>
      </div>
    </div>
  );
}
