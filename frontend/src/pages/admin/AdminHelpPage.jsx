/**
 * AdminHelpPage — Help & documentation for admin users.
 * Covers upload formats, common errors, and troubleshooting.
 */
import { useState } from "react";
import { ChevronDown, HelpCircle, FileText, AlertTriangle } from "lucide-react";
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

export default function AdminHelpPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-gold-100 rounded-lg">
          <HelpCircle className="w-6 h-6 text-gold-700" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Help &amp; Documentation</h1>
          <p className="text-sm text-slate-500">Upload formats, common errors, and troubleshooting</p>
        </div>
      </div>

      {/* Upload Formats */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-700 flex items-center gap-2">
          <FileText className="w-5 h-5 text-slate-500" />
          Upload Formats
        </h2>

        <Section icon={FileText} title="Class Timetable — DOCX format" defaultOpen>
          <p>
            Required format is <strong>Microsoft Word .docx</strong>. Structure the document with one
            or more tables per department.
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              First column is <strong>Day abbreviation</strong> (MON, TUE, WED, THURS, FRI).
            </li>
            <li>
              Subsequent columns are <strong>time slot labels</strong> (e.g. &quot;8am-10am&quot;).
            </li>
            <li>
              Cell content: <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">COURSE_CODE (Lecturer Surname, Venue)</code>.
            </li>
            <li>Multiple courses per cell separated by newline.</li>
            <li>
              Break cells: Write <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">BREAK</code>.
            </li>
            <li>Add department name in bold text paragraph above each table.</li>
            <li>Add faculty code paragraph above.</li>
          </ul>
        </Section>

        <Section icon={FileText} title="Results Upload — XLSX format">
          <p>Expected row layout:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Row 1:</strong> Blank or university name.</li>
            <li><strong>Row 2:</strong> Full faculty name.</li>
            <li><strong>Row 3:</strong> Full department name.</li>
            <li><strong>Row 4:</strong> Level as text (e.g. &quot;200 Level&quot;).</li>
            <li><strong>Row 5:</strong> Blank.</li>
            <li>
              <strong>Row 6:</strong> Column headers &mdash;{" "}
              <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">S/NO | MATRIC NO | NAME | then course columns</code>.
            </li>
            <li><strong>Row 7:</strong> Credit units per course.</li>
            <li><strong>Row 8+:</strong> Student data with raw scores (0-100).</li>
          </ul>
          <p>
            Summary columns (GP, SGPA, CTUL, PGPA) come after all course columns.
            Course codes must match the database exactly.
          </p>
        </Section>

        <Section icon={FileText} title="Student Whitelist — CSV format">
          <p>Columns:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">matric_number</code> &mdash; format:{" "}
              <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">XX/AAA/NNN</code>
            </li>
            <li>
              <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">full_name</code>
            </li>
            <li>
              <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">department_id</code> &mdash; the integer ID (not the department code)
            </li>
            <li>
              <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">level</code> &mdash; values: 100-600
            </li>
          </ul>
        </Section>

        <Section icon={FileText} title="Academic Calendar — DOCX format">
          <p>
            One table with columns:{" "}
            <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">Date | Event | Type</code>.
          </p>
          <p>
            Type values:{" "}
            <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">registration</code>,{" "}
            <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">exams</code>,{" "}
            <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">break</code>,{" "}
            <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">holiday</code>,{" "}
            <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">resumption</code>,{" "}
            <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">other</code>.
          </p>
        </Section>
      </div>

      {/* Common Errors */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-700 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          Common Errors &amp; Solutions
        </h2>

        <Section icon={AlertTriangle} title={`"No course columns found in the file"`}>
          <p>
            Row 6 of your XLSX file does not contain course codes in the expected{" "}
            <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">LETTERS + SPACE + DIGITS</code>{" "}
            format (e.g. <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">CSC 211</code>).
          </p>
          <p>
            Check that row 6 is actually the header row and that course codes use a space between the
            department prefix and number.
          </p>
        </Section>

        <Section icon={AlertTriangle} title={`"Timetable: unmatched courses [CSC111]"`}>
          <p>
            The course code in your timetable DOCX does not match any course in the database.
            Common causes:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              Missing space: <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">CSC111</code>{" "}
              vs <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">CSC 111</code>.
            </li>
            <li>Extra characters or trailing whitespace in the cell.</li>
            <li>Course not yet created in the system.</li>
          </ul>
        </Section>

        <Section icon={AlertTriangle} title={`"Only DOCX files are supported for class timetable"`}>
          <p>
            You uploaded a file that is not a <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">.docx</code>{" "}
            file. The timetable parser only accepts Microsoft Word .docx format. PDF, .doc (legacy), and
            other formats are not supported.
          </p>
        </Section>

        <Section icon={AlertTriangle} title={`"Department ID X does not exist"`}>
          <p>
            The <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">department_id</code> in your
            CSV whitelist does not match any department in the database. Use the integer ID from the
            Departments page, not the department code or name.
          </p>
        </Section>
      </div>
    </div>
  );
}
