import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAppContext } from '../../context/AppContext';
import { Plus, Users, ArrowRight, Copy, Check } from 'lucide-react';
import { motion } from 'framer-motion';

export const Dashboard = () => {
  const { currentUser, classes, createClass, joinClass } = useAppContext();
  const navigate = useNavigate();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [className, setClassName] = useState('');
  const [classDesc, setClassDesc] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const isTeacher = currentUser.role === 'teacher';
  
  // Filter classes: for demo, teacher sees classes they own, student sees all mock classes.
  const displayClasses = isTeacher 
    ? classes.filter(c => c.teacherId === currentUser.id)
    : classes;

  const handleAction = (e: React.FormEvent) => {
    e.preventDefault();
    if (isTeacher) {
      if (className && classDesc) {
        createClass(className, classDesc);
        setClassName('');
        setClassDesc('');
        setIsModalOpen(false);
      }
    } else {
      if (joinCode) {
        joinClass(joinCode);
        setJoinCode('');
        setIsModalOpen(false);
      }
    }
  };

  const copyToClipboard = (code: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white">
            {isTeacher ? 'My Classes' : 'Enrolled Classes'}
          </h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {isTeacher 
              ? 'Manage your classrooms and assignments.' 
              : 'View your enrolled classes and pending tasks.'}
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="mt-4 sm:mt-0 flex items-center space-x-2 px-5 py-2.5 bg-[var(--app-accent)] hover:bg-[color-mix(in_srgb,var(--app-accent)_88%,black)] text-[var(--app-on-accent)] rounded-lg font-medium transition-all shadow-md hover:shadow-lg"
        >
          <Plus className="w-5 h-5" />
          <span>{isTeacher ? 'Create Class' : 'Join Class'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {displayClasses.map((cls) => (
          <motion.div
            key={cls.id}
            whileHover={{ y: -4, transition: { duration: 0.2 } }}
            className="group relative bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden cursor-pointer flex flex-col"
            onClick={() => navigate(`/class/${cls.id}`)}
          >
            <div className="h-32 bg-gradient-to-r from-[var(--app-accent)] to-[var(--app-accent-2)] px-6 py-5 flex flex-col justify-end">
              <h3 className="text-xl font-bold text-white mb-1 truncate">{cls.name}</h3>
              <p className="text-white/80 text-sm opacity-90 truncate">{cls.description}</p>
            </div>
            <div className="p-6 flex-1 flex flex-col justify-between">
              <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400 mb-4">
                <div className="flex items-center">
                  <Users className="w-4 h-4 mr-1.5" />
                  <span>24 Students</span>
                </div>
                {isTeacher && (
                  <div 
                    onClick={(e) => copyToClipboard(cls.code, e)}
                    className="flex items-center space-x-1 px-2 py-1 rounded bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition"
                  >
                    <span className="font-mono font-medium text-slate-700 dark:text-slate-200 text-xs">
                      {cls.code}
                    </span>
                    {copiedCode === cls.code ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </div>
                )}
              </div>
              <div className="flex items-center text-[var(--app-accent)] font-medium group-hover:underline mt-auto">
                <span className="text-sm">View Details</span>
                <ArrowRight className="w-4 h-4 ml-1 opacity-0 group-hover:opacity-100 transform -translate-x-2 group-hover:translate-x-0 transition-all" />
              </div>
            </div>
          </motion.div>
        ))}

        {displayClasses.length === 0 && (
          <div className="col-span-full py-16 flex flex-col items-center justify-center border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl">
            <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4 text-slate-400">
              <Users className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-1">No classes yet</h3>
            <p className="text-slate-500 dark:text-slate-400 text-center max-w-sm">
              {isTeacher 
                ? 'Create your first class to start inviting students and assigning work.'
                : 'Join a class using the unique code provided by your teacher.'}
            </p>
          </div>
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }} 
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                {isTeacher ? 'Create New Class' : 'Join a Class'}
              </h2>
            </div>
            <form onSubmit={handleAction} className="p-6 space-y-4">
              {isTeacher ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Class Name</label>
                    <input
                      required
                      type="text"
                      value={className}
                      onChange={(e) => setClassName(e.target.value)}
                      className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-[var(--app-ring)] dark:bg-slate-700 dark:text-white"
                      placeholder="e.g. Introduction to Biology"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Description</label>
                    <textarea
                      required
                      value={classDesc}
                      onChange={(e) => setClassDesc(e.target.value)}
                      className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-[var(--app-ring)] dark:bg-slate-700 dark:text-white"
                      placeholder="Brief overview of the class..."
                      rows={3}
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Class Code</label>
                  <input
                    required
                    type="text"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-[var(--app-ring)] dark:bg-slate-700 dark:text-white uppercase font-mono"
                    placeholder="e.g. A1B2C3"
                  />
                  <p className="mt-2 text-xs text-slate-500">Ask your teacher for the class code, then enter it here.</p>
                </div>
              )}
              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-200 dark:border-slate-700 mt-6">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[var(--app-accent)] hover:bg-[color-mix(in_srgb,var(--app-accent)_88%,black)] text-[var(--app-on-accent)] rounded-lg font-medium transition"
                >
                  {isTeacher ? 'Create' : 'Join'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
};
