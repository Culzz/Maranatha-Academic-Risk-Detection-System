/**
 * SolidarityWallPage — Anonymous encouragement wall for students.
 * Posts are fully anonymous (no student_id stored).
 */
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Heart, Send, Loader2 } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { solidarityApi, studentsApi } from "../../services/api";
import CustomDropdown from "../../components/ui/CustomDropdown";

const EMOJIS = ["❤️", "💪", "🙏", "🎉"];

export default function SolidarityWallPage() {
  const { token } = useAuth();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState([]);
  const [courseFilter, setCourseFilter] = useState("");
  const [newPost, setNewPost] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) return;
    studentsApi.getMyCourses(token)
      .then(data => setCourses(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    solidarityApi.getPosts(courseFilter || null, token)
      .then(data => setPosts(Array.isArray(data) ? data : []))
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  }, [token, courseFilter]);

  const handleSubmit = async () => {
    if (!newPost.trim() || submitting) return;
    setSubmitting(true);
    try {
      const post = await solidarityApi.createPost(newPost.trim(), courseFilter || null, token);
      setPosts(prev => [post, ...prev]);
      setNewPost("");
    } catch {}
    setSubmitting(false);
  };

  const handleReact = async (postId, emoji) => {
    try {
      const res = await solidarityApi.reactToPost(postId, emoji, token);
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, emoji_counts: res.emoji_counts } : p));
    } catch {}
  };

  const COURSE_OPTIONS = [
    { value: "", label: "All courses" },
    ...courses.map(c => ({
      value: String(c.id ?? c.course_id),
      label: `${c.course_code} — ${c.course_title}`,
    })),
  ];

  return (
    <div className="max-w-xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-pink-50 border border-pink-200 flex items-center justify-center flex-shrink-0">
          <Heart size={18} className="text-pink-500" />
        </div>
        <div>
          <h1 className="font-serif text-2xl font-bold text-slate-900">Solidarity Wall</h1>
          <p className="text-sm text-slate-500">Anonymous encouragement from your peers</p>
        </div>
      </div>

      {/* Course filter */}
      <div className="max-w-xs">
        <CustomDropdown
          value={courseFilter}
          onChange={setCourseFilter}
          options={COURSE_OPTIONS}
          placeholder="Filter by course"
        />
      </div>

      {/* Post form */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          Share encouragement (anonymous)
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={newPost}
            onChange={e => setNewPost(e.target.value.slice(0, 150))}
            onKeyDown={e => e.key === "Enter" && handleSubmit()}
            placeholder="Write something kind..."
            className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pink-200"
            maxLength={150}
          />
          <button
            onClick={handleSubmit}
            disabled={!newPost.trim() || submitting}
            className="px-4 py-2 bg-pink-500 text-white rounded-lg text-sm font-semibold hover:bg-pink-600 transition-colors disabled:opacity-40 flex items-center gap-1.5"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Post
          </button>
        </div>
        <p className="text-[10px] text-slate-400 mt-1 text-right">{newPost.length}/150</p>
      </div>

      {/* Posts */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-slate-400" />
        </div>
      ) : posts.length === 0 ? (
        <p className="text-center text-slate-400 py-8 text-sm">
          No posts yet. Be the first to share some encouragement!
        </p>
      ) : (
        <div className="space-y-3">
          {posts.map(post => (
            <motion.div
              key={post.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm"
            >
              <p className="text-sm text-slate-800 leading-relaxed mb-3">{post.content}</p>
              <div className="flex items-center justify-between">
                <div className="flex gap-1.5">
                  {EMOJIS.map(emoji => {
                    const count = post.emoji_counts?.[emoji] || 0;
                    return (
                      <button
                        key={emoji}
                        onClick={() => handleReact(post.id, emoji)}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs border border-slate-100 hover:border-pink-200 hover:bg-pink-50 transition-colors"
                      >
                        {emoji} {count > 0 && <span className="text-slate-500 font-medium">{count}</span>}
                      </button>
                    );
                  })}
                </div>
                <span className="text-[10px] text-slate-400">
                  {post.created_at ? new Date(post.created_at).toLocaleDateString() : ""}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
