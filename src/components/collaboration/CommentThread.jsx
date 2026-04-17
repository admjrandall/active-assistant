import React, { useState, useEffect, useContext } from 'react'
import { CRMContext } from '../../context.jsx'
import { useCurrentUser } from '../../hooks/useCurrentUser.js'
import { formatDistance } from 'date-fns'
import { MentionInput } from './MentionInput.jsx'

export const CommentThread = ({ resourceType, resourceId, showToast }) => {
  const { DB } = useContext(CRMContext)
  const currentUser = useCurrentUser()
  const [comments, setComments] = useState([])
  const [users, setUsers] = useState([])
  const [newComment, setNewComment] = useState('')
  const [replyingTo, setReplyingTo] = useState(null)
  const [editingComment, setEditingComment] = useState(null)

  useEffect(() => {
    loadComments()
    loadUsers()
  }, [resourceType, resourceId])

  const loadComments = async () => {
    const allComments = await DB.getAll('comments')
    const filtered = allComments.filter(
      c => c.resourceType === resourceType && c.resourceId === resourceId
    )
    setComments(filtered.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)))
  }

  const loadUsers = async () => {
    const data = await DB.getAll('users')
    setUsers(data)
  }

  const handleSubmit = async () => {
    if (!newComment.trim()) return

    const comment = {
      id: DB.generateId(),
      resourceType,
      resourceId,
      userId: currentUser?.id || 'offline-user',
      text: newComment,
      mentions: extractMentions(newComment),
      attachments: [],
      createdAt: new Date().toISOString(),
      editedAt: null,
      reactions: {},
      parentId: replyingTo?.id || null,
    }

    await DB.put('comments', comment)

    // Create notifications for mentioned users
    for (const mentionedUserId of comment.mentions) {
      if (mentionedUserId !== currentUser?.id) {
        const notification = {
          id: DB.generateId(),
          userId: mentionedUserId,
          type: 'mention',
          title: 'You were mentioned',
          message: `${currentUser?.displayName || 'Someone'} mentioned you in a comment`,
          resourceType,
          resourceId,
          actionUrl: `/${resourceType}/${resourceId}`,
          read: false,
          createdAt: new Date().toISOString(),
        }
        await DB.put('notifications', notification)
      }
    }

    setNewComment('')
    setReplyingTo(null)
    await loadComments()
    showToast?.('Comment added')
  }

  const handleEdit = async (commentId, newText) => {
    const comment = comments.find(c => c.id === commentId)
    if (!comment) return

    const updated = {
      ...comment,
      text: newText,
      editedAt: new Date().toISOString(),
    }

    await DB.put('comments', updated)
    setEditingComment(null)
    await loadComments()
    showToast?.('Comment updated')
  }

  const handleDelete = async (commentId) => {
    if (!confirm('Delete this comment?')) return
    await DB.delete('comments', commentId)
    await loadComments()
    showToast?.('Comment deleted')
  }

  const handleReaction = async (commentId, emoji) => {
    const comment = comments.find(c => c.id === commentId)
    if (!comment) return

    const userId = currentUser?.id || 'offline-user'
    const reactions = { ...comment.reactions }

    if (!reactions[emoji]) reactions[emoji] = []

    if (reactions[emoji].includes(userId)) {
      reactions[emoji] = reactions[emoji].filter(id => id !== userId)
      if (reactions[emoji].length === 0) delete reactions[emoji]
    } else {
      reactions[emoji].push(userId)
    }

    await DB.put('comments', { ...comment, reactions })
    await loadComments()
  }

  const extractMentions = (text) => {
    const mentionRegex = /@(\w+)/g
    const mentions = []
    let match

    while ((match = mentionRegex.exec(text)) !== null) {
      const username = match[1].toLowerCase()
      const user = users.find(u => u.email?.toLowerCase().startsWith(username) || u.displayName?.toLowerCase().includes(username))
      if (user && !mentions.includes(user.id)) {
        mentions.push(user.id)
      }
    }

    return mentions
  }

  const topLevelComments = comments.filter(c => !c.parentId)

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">
        Comments ({comments.length})
      </h3>

      {/* Comment List */}
      <div className="space-y-3">
        {topLevelComments.map(comment => (
          <CommentItem
            key={comment.id}
            comment={comment}
            users={users}
            currentUser={currentUser}
            replies={comments.filter(c => c.parentId === comment.id)}
            onReply={setReplyingTo}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onReaction={handleReaction}
            editingComment={editingComment}
            setEditingComment={setEditingComment}
          />
        ))}
      </div>

      {/* New Comment / Reply Input */}
      <div className="border-t border-slate-200 pt-4">
        {replyingTo && (
          <div className="mb-2 px-3 py-2 bg-slate-100 rounded-lg text-xs text-slate-600 flex justify-between items-center">
            <span>Replying to {users.find(u => u.id === replyingTo.userId)?.displayName || 'user'}</span>
            <button onClick={() => setReplyingTo(null)} className="text-slate-400 hover:text-slate-600">✕</button>
          </div>
        )}

        <MentionInput
          value={newComment}
          onChange={setNewComment}
          users={users}
          placeholder={replyingTo ? 'Write a reply...' : 'Add a comment...'}
        />

        <div className="flex justify-end gap-2 mt-2">
          {replyingTo && (
            <button onClick={() => setReplyingTo(null)} className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">
              Cancel
            </button>
          )}
          <button
            onClick={handleSubmit}
            disabled={!newComment.trim()}
            className="px-4 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {replyingTo ? 'Reply' : 'Comment'}
          </button>
        </div>
      </div>
    </div>
  )
}

const CommentItem = ({ comment, users, currentUser, replies, onReply, onEdit, onDelete, onReaction, editingComment, setEditingComment }) => {
  const [editText, setEditText] = useState(comment.text)
  const author = users.find(u => u.id === comment.userId)
  const isOwn = comment.userId === currentUser?.id || (comment.userId === 'offline-user' && !currentUser)
  const isEditing = editingComment === comment.id

  const reactionEmojis = ['👍', '❤️', '😄', '🎉', '🚀']

  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-xs font-bold text-indigo-600 flex-shrink-0">
        {author ? author.displayName.charAt(0).toUpperCase() : '?'}
      </div>

      <div className="flex-1 min-w-0">
        <div className="bg-slate-50 rounded-lg p-3">
          <div className="flex justify-between items-start mb-1">
            <div>
              <span className="text-sm font-semibold text-slate-900">{author?.displayName || 'Anonymous'}</span>
              <span className="text-xs text-slate-500 ml-2">
                {formatDistance(new Date(comment.createdAt), new Date(), { addSuffix: true })}
                {comment.editedAt && ' (edited)'}
              </span>
            </div>
            {isOwn && !isEditing && (
              <div className="flex gap-1">
                <button onClick={() => setEditingComment(comment.id)} className="text-xs text-slate-500 hover:text-slate-700">Edit</button>
                <button onClick={() => onDelete(comment.id)} className="text-xs text-rose-500 hover:text-rose-700">Delete</button>
              </div>
            )}
          </div>

          {isEditing ? (
            <div className="space-y-2">
              <textarea
                value={editText}
                onChange={e => setEditText(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg resize-none"
                rows={3}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    onEdit(comment.id, editText)
                    setEditingComment(null)
                  }}
                  className="px-3 py-1 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setEditText(comment.text)
                    setEditingComment(null)
                  }}
                  className="px-3 py-1 text-xs border border-slate-200 rounded-lg hover:bg-slate-100"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{comment.text}</p>
          )}
        </div>

        {/* Reactions */}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {Object.entries(comment.reactions || {}).map(([emoji, userIds]) => (
            <button
              key={emoji}
              onClick={() => onReaction(comment.id, emoji)}
              className={`px-2 py-0.5 text-xs rounded-full border transition-all ${
                userIds.includes(currentUser?.id || 'offline-user')
                  ? 'bg-indigo-100 border-indigo-300'
                  : 'bg-white border-slate-200 hover:bg-slate-50'
              }`}
            >
              {emoji} {userIds.length}
            </button>
          ))}

          {/* Add Reaction Button */}
          <div className="relative group">
            <button className="px-2 py-0.5 text-xs rounded-full border border-slate-200 hover:bg-slate-50">
              +
            </button>
            <div className="absolute left-0 bottom-full mb-1 hidden group-hover:flex gap-1 bg-white border border-slate-200 rounded-lg p-1 shadow-lg">
              {reactionEmojis.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => onReaction(comment.id, emoji)}
                  className="text-lg hover:scale-125 transition-transform"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Reply Button */}
          <button onClick={() => onReply(comment)} className="text-xs text-slate-500 hover:text-slate-700 ml-2">
            Reply
          </button>
        </div>

        {/* Replies */}
        {replies.length > 0 && (
          <div className="mt-3 space-y-2 pl-4 border-l-2 border-slate-200">
            {replies.map(reply => (
              <CommentItem
                key={reply.id}
                comment={reply}
                users={users}
                currentUser={currentUser}
                replies={[]}
                onReply={onReply}
                onEdit={onEdit}
                onDelete={onDelete}
                onReaction={onReaction}
                editingComment={editingComment}
                setEditingComment={setEditingComment}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
