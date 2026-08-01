/**
 * LecturerHelpPage — Help documentation for lecturers.
 * Covers interventions, attendance, pre-lecture brief, quiz security, and heatmap.
 */
import { useState } from "react";
import {
  ChevronDown, HelpCircle, Bell, CalendarCheck,
  FileText, Shield, Users,
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

export default function LecturerHelpPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-gold-100 rounded-lg">
          <HelpCircle className="w-6 h-6 text-gold-700" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Help &amp; Documentation</h1>
          <p className="text-sm text-slate-500">Guides for interventions, attendance, quizzes, and more</p>
        </div>
      </div>

      {/* Help Sections */}
      <div className="space-y-3">
        <Section icon={Bell} title="How to Generate an AI Intervention" defaultOpen>
          <ol className="list-decimal pl-5 space-y-1">
            <li>
              Go to <strong>Interventions</strong> in the sidebar.
            </li>
            <li>
              Click <strong>&quot;New AI Intervention&quot;</strong> in the page header.
            </li>
            <li>
              Select an at-risk student from the dropdown (Medium and High risk students are shown).
            </li>
            <li>
              The system reads the student&apos;s risk score and SHAP explanation to craft a
              personalised message — click <strong>Generate</strong> to produce it.
            </li>
            <li>Review the generated message in the confirmation screen.</li>
            <li>The student is notified automatically once the intervention is sent.</li>
          </ol>
        </Section>

        <Section icon={CalendarCheck} title="How to Mark Attendance">
          <ol className="list-decimal pl-5 space-y-1">
            <li>
              Go to <strong>Attendance Management</strong> in the sidebar and select a course.
            </li>
            <li>
              Click <strong>&quot;Open Attendance Session&quot;</strong>.
            </li>
            <li>A QR code and a 6-character code are generated automatically.</li>
            <li>Display the QR code on the projector for students to scan.</li>
            <li>The session expires after the number of minutes you set.</li>
            <li>The attendance count updates live as students check in.</li>
          </ol>
        </Section>

        <Section icon={FileText} title="How the Pre-Lecture Brief Works">
          <p>
            The Overview page shows a <strong>Pre-Lecture Brief</strong> for the selected course.
            It includes:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Predicted attendance for the upcoming class.</li>
            <li>Weakest quiz topic based on recent performance.</li>
            <li>Top 3 at-risk students who may need attention.</li>
            <li>Class mood distribution from recent check-ins.</li>
          </ul>
          <p>
            Use this brief to prepare targeted content and identify students who may benefit from
            extra support during the lecture.
          </p>
        </Section>

        <Section icon={Shield} title="Quiz Cheating Detection">
          <p>
            Quiz results include a <strong>&quot;Security&quot;</strong> column with the following
            indicators:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Tab Switch Count:</strong> Shows how many times the student left the quiz tab.
              More than 10 switches combined with a perfect score may indicate use of external resources.
            </li>
            <li>
              <strong>Similarity Score:</strong> For theory-type questions, a similarity score above
              85% between two students is flagged.
            </li>
          </ul>
          <p className="text-amber-600 font-medium">
            These are signals, not proof. Use them as a starting point for further investigation, not
            as grounds for disciplinary action on their own.
          </p>
        </Section>

        <Section icon={Users} title="Why Are Some Students Not on My Heatmap?">
          <p>Only students with computed risk scores appear on the engagement heatmap.</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              Ask your admin to go to <strong>Model Performance</strong> and run{" "}
              <strong>&quot;Compute Risk Scores&quot;</strong> if scores are missing.
            </li>
            <li>
              The student may not be enrolled in your course. Check the Students &amp; Risk page for
              the full enrollment list.
            </li>
          </ul>
        </Section>
      </div>
    </div>
  );
}
