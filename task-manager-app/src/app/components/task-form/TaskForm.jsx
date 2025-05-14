import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

const TaskForm = ({ onSave, onCancel, initialTab = 'todo' }) => {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [task, setTask] = useState({
    id: uuidv4(),
    type: activeTab, // 'todo' または 'schedule'
    title: '',
    project: '',
    dueDate: '',
    dueTime: '',
    targetCompletionDate: '',
    labels: [],
    links: [],
    notification: true,
    subtasks: [],
    memo: '',
    noTask: false,
    startTime: '',
    endTime: '',
    createdAt: new Date(),
    updatedAt: new Date(),
    status: 'Not Yet' // 'Not Yet' | 'In Progress' | 'Completed'
  });

  const [newLabel, setNewLabel] = useState('');
  const [newLink, setNewLink] = useState({ title: '', url: '' });
  const [newSubtask, setNewSubtask] = useState({ title: '', completed: false });

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setTask({
      ...task,
      [name]: type === 'checkbox' ? checked : value
    });
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setTask({
      ...task,
      type: tab
    });
  };

  const addLabel = () => {
    if (newLabel.trim()) {
      setTask({
        ...task,
        labels: [...task.labels, newLabel.trim()]
      });
      setNewLabel('');
    }
  };

  const removeLabel = (index) => {
    const updatedLabels = [...task.labels];
    updatedLabels.splice(index, 1);
    setTask({
      ...task,
      labels: updatedLabels
    });
  };

  const addLink = () => {
    if (newLink.title.trim() && newLink.url.trim()) {
      setTask({
        ...task,
        links: [...task.links, { ...newLink, id: uuidv4() }]
      });
      setNewLink({ title: '', url: '' });
    }
  };

  const removeLink = (index) => {
    const updatedLinks = [...task.links];
    updatedLinks.splice(index, 1);
    setTask({
      ...task,
      links: updatedLinks
    });
  };

  const addSubtask = () => {
    if (newSubtask.title.trim()) {
      setTask({
        ...task,
        subtasks: [...task.subtasks, { ...newSubtask, id: uuidv4() }]
      });
      setNewSubtask({ title: '', completed: false });
    }
  };

  const removeSubtask = (index) => {
    const updatedSubtasks = [...task.subtasks];
    updatedSubtasks.splice(index, 1);
    setTask({
      ...task,
      subtasks: updatedSubtasks
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...task,
      updatedAt: new Date()
    });
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-2xl mx-auto">
      <div className="flex mb-6 border-b">
        <button
          className={`px-4 py-2 ${activeTab === 'todo' ? 'text-blue-600 border-b-2 border-blue-600 font-medium' : 'text-gray-500'}`}
          onClick={() => handleTabChange('todo')}
        >
          TODO
        </button>
        <button
          className={`px-4 py-2 ${activeTab === 'schedule' ? 'text-blue-600 border-b-2 border-blue-600 font-medium' : 'text-gray-500'}`}
          onClick={() => handleTabChange('schedule')}
        >
          スケジュール
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label className="block text-gray-700 font-medium mb-2" htmlFor="title">
            タイトル*
          </label>
          <input
            type="text"
            id="title"
            name="title"
            value={task.title}
            onChange={handleChange}
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        {activeTab === 'todo' ? (
          <>
            <div className="mb-4">
              <label className="block text-gray-700 font-medium mb-2" htmlFor="project">
                プロジェクト
              </label>
              <input
                type="text"
                id="project"
                name="project"
                value={task.project}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-gray-700 font-medium mb-2" htmlFor="dueDate">
                  締め切り日
                </label>
                <input
                  type="date"
                  id="dueDate"
                  name="dueDate"
                  value={task.dueDate}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-gray-700 font-medium mb-2" htmlFor="dueTime">
                  締め切り時間
                </label>
                <input
                  type="time"
                  id="dueTime"
                  name="dueTime"
                  value={task.dueTime}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-gray-700 font-medium mb-2" htmlFor="targetCompletionDate">
                目標完了日
              </label>
              <input
                type="date"
                id="targetCompletionDate"
                name="targetCompletionDate"
                value={task.targetCompletionDate}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="mb-4">
              <label className="block text-gray-700 font-medium mb-2">
                サブタスク
              </label>
              <div className="flex mb-2">
                <input
                  type="text"
                  value={newSubtask.title}
                  onChange={(e) => setNewSubtask({ ...newSubtask, title: e.target.value })}
                  placeholder="サブタスクを追加"
                  className="flex-grow border border-gray-300 rounded-l-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={addSubtask}
                  className="bg-blue-500 text-white px-4 py-2 rounded-r-md hover:bg-blue-600"
                >
                  追加
                </button>
              </div>
              <ul className="space-y-2">
                {task.subtasks.map((subtask, index) => (
                  <li key={subtask.id || index} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                    <span>{subtask.title}</span>
                    <button
                      type="button"
                      onClick={() => removeSubtask(index)}
                      className="text-red-500 hover:text-red-700"
                    >
                      削除
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : (
          <>
            <div className="mb-4 flex items-center">
              <input
                type="checkbox"
                id="noTask"
                name="noTask"
                checked={task.noTask}
                onChange={handleChange}
                className="mr-2"
              />
              <label className="text-gray-700 font-medium" htmlFor="noTask">
                ノータスク
              </label>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-gray-700 font-medium mb-2" htmlFor="dueDate">
                  いつ
                </label>
                <input
                  type="date"
                  id="dueDate"
                  name="dueDate"
                  value={task.dueDate}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-gray-700 font-medium mb-2" htmlFor="startTime">
                  開始時間
                </label>
                <input
                  type="time"
                  id="startTime"
                  name="startTime"
                  value={task.startTime}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-gray-700 font-medium mb-2" htmlFor="endTime">
                  終了時間
                </label>
                <input
                  type="time"
                  id="endTime"
                  name="endTime"
                  value={task.endTime}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </>
        )}

        <div className="mb-4">
          <label className="block text-gray-700 font-medium mb-2">
            ラベル
          </label>
          <div className="flex mb-2">
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="新しいラベルを追加"
              className="flex-grow border border-gray-300 rounded-l-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={addLabel}
              className="bg-blue-500 text-white px-4 py-2 rounded-r-md hover:bg-blue-600"
            >
              追加
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {task.labels.map((label, index) => (
              <span
                key={index}
                className="bg-blue-100 text-blue-800 text-sm px-2 py-1 rounded-full flex items-center"
              >
                {label}
                <button
                  type="button"
                  onClick={() => removeLabel(index)}
                  className="ml-1 text-blue-800 hover:text-blue-900"
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-gray-700 font-medium mb-2">
            リンク
          </label>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={newLink.title}
              onChange={(e) => setNewLink({ ...newLink, title: e.target.value })}
              placeholder="タイトル"
              className="flex-grow border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="url"
              value={newLink.url}
              onChange={(e) => setNewLink({ ...newLink, url: e.target.value })}
              placeholder="URL"
              className="flex-grow border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={addLink}
              className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600"
            >
              追加
            </button>
          </div>
          <ul className="space-y-2">
            {task.links.map((link, index) => (
              <li key={link.id || index} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  {link.title}
                </a>
                <button
                  type="button"
                  onClick={() => removeLink(index)}
                  className="text-red-500 hover:text-red-700"
                >
                  削除
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="mb-4 flex items-center">
          <input
            type="checkbox"
            id="notification"
            name="notification"
            checked={task.notification}
            onChange={handleChange}
            className="mr-2"
          />
          <label className="text-gray-700 font-medium" htmlFor="notification">
            通知
          </label>
        </div>

        <div className="mb-4">
          <label className="block text-gray-700 font-medium mb-2" htmlFor="memo">
            メモ
          </label>
          <textarea
            id="memo"
            name="memo"
            value={task.memo}
            onChange={handleChange}
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 h-24"
          ></textarea>
        </div>

        <div className="flex justify-end space-x-4">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            キャンセル
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            保存
          </button>
        </div>
      </form>
    </div>
  );
};

export default TaskForm; 