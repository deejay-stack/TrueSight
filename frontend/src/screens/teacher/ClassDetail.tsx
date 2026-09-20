import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import { useAppContext } from './../../context/AppContext';
import { FileText, Plus, Calendar, Clock, ChevronRight, ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';
import { format, isPast } from 'date-fns';
import clsx from 'clsx';

export const ClassDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentUser, classes, assignments, createAssignment } = useAppContext();
  
  const cls = classes.find(c => c.id === id);
  const classAssignments = assignments.filter(a => a.classId === id);
  const isTeacher = currentUser.role === 'teacher';

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [submissionType, setSubmissionType] = useState<'text' | 'document'>('text');

  if (!cls) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold text-slate-700 dark:text-slate-300">Class not found</h2>
        <button onClick={() => navigate('/')} className="mt-4 text-[var(--app-accent)] hover:underline">
          Return to Dashboard
        </button>
      </div>
    );
  }

  const handleCreateAssignment = (e: React.FormEvent) => {
    e.preventDefault();
    if (title && description && dueDate) {
      createAssignment(cls.id, title, description, dueDate, submissionType);
      setTitle('');
      setDescription('');
      setDueDate('');
      setSubmissionType('text');
      setIsModalOpen(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-5xl mx-auto">
      {/* Back button */}
      <button 
        onClick={() => navigate('/')}
        className="flex items-center text-sm font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white mb-6 group transition-colors"
      >
        <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
        Back to Classes
      </button>

      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[var(--app-accent)] to-[var(--app-accent-2)] p-8 sm:p-10 shadow-lg text-white">
        <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-end">
          <div className="max-w-2xl">
            <h1 className="text-4xl font-extrabold mb-3 tracking-tight">{cls.name}</h1>
            <p className="text-white/80 text-lg opacity-90 leading-relaxed mb-4">{cls.description}</p>
            {isTeacher && (
              <div className="inline-flex items-center bg-white/20 backdrop-blur-sm rounded-lg px-4 py-2 mt-2">
                <span className="text-sm font-medium uppercase tracking-wider text-white/80">Class Code</span>
                <span className="mx-3 w-px h-4 bg-white/40"></span>
                <span className="font-mono font-bold text-lg tracking-widest">{cls.code}</span>
              </div>
            )}
          </div>
          {isTeacher && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="mt-6 sm:mt-0 flex items-center space-x-2 px-5 py-2.5 bg-white text-[var(--app-accent)] hover:bg-slate-50 rounded-lg font-semibold shadow-md transition-all active:scale-95 whitespace-nowrap"
            >
              <Plus className="w-5 h-5" />
              <span>New Assignment</span>
            </button>
          )}
        </div>
        
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-white opacity-5 rounded-full blur-3xl mix-blend-overlay"></div>
        <div className="absolute bottom-0 right-40 -mb-10 w-40 h-40 bg-[var(--app-accent-2)] opacity-20 rounded-full blur-2xl mix-blend-overlay"></div>
      </div>

      {/* Assignments List */}
      <div className="mt-12">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center mb-6">
          <FileText className="w-6 h-6 mr-3 text-[var(--app-accent)]" />
          Classwork ({classAssignments.length})
        </h2>

        <div className="space-y-4">
          {classAssignments.length === 0 ? (
            <div className="bg-white dark:bg-slate-800 rounded-xl p-12 text-center border border-slate-200 dark:border-slate-700">
              <div className="w-16 h-16 bg-slate-50 dark:bg-slate-900/50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
                <FileText className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-medium text-slate-900 dark:text-white">No assignments yet</h3>
              <p className="text-slate-500 mt-2">
                {isTeacher ? "Create your first assignment to share with the class." : "Your teacher hasn't posted any work yet."}
              </p>
            </div>
          ) : (
            classAssignments.map((assignment) => {
              const due = new Date(assignment.dueDate);
              const pastDue = isPast(due);
              
              return (
                <Link
                  key={assignment.id}
                  to={`/assignment/${assignment.id}`}
                  className="block group"
                >
                  <motion.div
                    whileHover={{ scale: 1.01 }}
                    className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 sm:p-6 shadow-sm hover:shadow-md transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="flex items-start space-x-4">
                      <div className="flex-shrink-0 w-12 h-12 bg-[color-mix(in_srgb,var(--app-accent)_10%,var(--app-surface))] rounded-full flex items-center justify-center text-[var(--app-accent)] mt-1">
                        <FileText className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white group-hover:text-[var(--app-accent)] dark:group-hover:text-[var(--app-accent)] transition-colors">
                          {assignment.title}
                        </h3>
                        <div className="flex items-center text-xs font-medium text-slate-400 mt-1 mb-1 uppercase tracking-wider">
                          <span className="bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded text-slate-600 dark:text-slate-300">
                            {assignment.submissionType === 'document' ? 'File Submission' : 'Text Entry'}
                          </span>
                        </div>
                        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 line-clamp-1 max-w-2xl">
                          {assignment.description}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t border-slate-100 dark:border-slate-700 sm:border-0 pt-4 sm:pt-0 mt-2 sm:mt-0">
                      <div className={clsx(
                        "flex items-center text-sm font-medium px-3 py-1.5 rounded-full bg-slate-50 dark:bg-slate-900",
                        pastDue ? "text-red-600 dark:text-red-400" : "text-slate-600 dark:text-slate-300"
                      )}>
                        {pastDue ? <Clock className="w-4 h-4 mr-2" /> : <Calendar className="w-4 h-4 mr-2" />}
                        <span>Due {format(due, 'MMM d, h:mm a')}</span>
                      </div>
                      
                      <div className="hidden sm:flex items-center text-sm text-slate-400 group-hover:text-[var(--app-accent)] mt-2 transition-colors">
                        View Details <ChevronRight className="w-4 h-4 ml-1" />
                      </div>
                    </div>
                  </motion.div>
                </Link>
              );
            })
          )}
        </div>
      </div>

      {/* Create Assignment Modal */}
      {isModalOpen && isTeacher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm overflow-y-auto">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }} 
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden my-8"
          >
            <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white flex items-center">
                <FileText className="w-5 h-5 mr-2 text-[var(--app-accent)]" />
                Create New Assignment
              </h2>
            </div>
            
            <form onSubmit={handleCreateAssignment} className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Assignment Title</label>
                <input
                  required
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-[var(--app-ring)] focus:border-[var(--app-accent)] dark:text-white transition-shadow"
                  placeholder="e.g. Midterm Essay: History of the Internet"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Instructions & Description</label>
                <textarea
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-[var(--app-ring)] focus:border-[var(--app-accent)] dark:text-white transition-shadow resize-y"
                  placeholder="Provide clear instructions for your students..."
                  rows={5}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Submission Type</label>
                  <div className="flex flex-col space-y-2">
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input 
                        type="radio" 
                        name="submissionType"
                        value="text" 
                        checked={submissionType === 'text'} 
                        onChange={() => setSubmissionType('text')} 
                        className="text-[var(--app-accent)] focus:ring-[var(--app-ring)]" 
                      />
                      <span className="text-slate-700 dark:text-slate-300 text-sm">Text (Essay)</span>
                    </label>
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input 
                        type="radio" 
                        name="submissionType"
                        value="document" 
                        checked={submissionType === 'document'} 
                        onChange={() => setSubmissionType('document')} 
                        className="text-[var(--app-accent)] focus:ring-[var(--app-ring)]" 
                      />
                      <span className="text-slate-700 dark:text-slate-300 text-sm">File (Document)</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Due Date & Time</label>
                  <input
                    required
                    type="datetime-local"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-[var(--app-ring)] focus:border-[var(--app-accent)] dark:text-white transition-shadow text-sm"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-6 border-t border-slate-200 dark:border-slate-700 mt-8">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 text-sm font-medium bg-[var(--app-accent)] hover:bg-[color-mix(in_srgb,var(--app-accent)_88%,black)] text-[var(--app-on-accent)] rounded-lg shadow-sm hover:shadow transition-all active:scale-95"
                >
                  Publish Assignment
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
};
