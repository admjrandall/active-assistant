import React, { useState, useRef, useEffect } from 'react'

export const MentionInput = ({ value, onChange, users, placeholder }) => {
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [cursorPosition, setCursorPosition] = useState(0)
  const inputRef = useRef(null)

  useEffect(() => {
    const text = value.slice(0, cursorPosition)
    const match = text.match(/@(\w*)$/)

    if (match) {
      const query = match[1].toLowerCase()
      const filtered = users.filter(u =>
        u.displayName?.toLowerCase().includes(query) ||
        u.email?.toLowerCase().includes(query)
      ).slice(0, 5)

      setSuggestions(filtered)
      setShowSuggestions(filtered.length > 0)
      setSelectedIndex(0)
    } else {
      setShowSuggestions(false)
    }
  }, [value, cursorPosition, users])

  const handleKeyDown = (e) => {
    if (!showSuggestions) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.min(prev + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (suggestions.length > 0) {
        e.preventDefault()
        insertMention(suggestions[selectedIndex])
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
    }
  }

  const insertMention = (user) => {
    const text = value.slice(0, cursorPosition)
    const match = text.match(/@(\w*)$/)

    if (match) {
      const beforeMention = text.slice(0, match.index)
      const afterCursor = value.slice(cursorPosition)
      const mention = `@${user.displayName.replace(/\s/g, '')}`

      const newValue = beforeMention + mention + ' ' + afterCursor
      onChange(newValue)

      setShowSuggestions(false)

      // Move cursor after mention
      setTimeout(() => {
        const newPos = beforeMention.length + mention.length + 1
        inputRef.current?.setSelectionRange(newPos, newPos)
        setCursorPosition(newPos)
      }, 0)
    }
  }

  return (
    <div className="relative">
      <textarea
        ref={inputRef}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setCursorPosition(e.target.selectionStart)
        }}
        onKeyDown={handleKeyDown}
        onClick={(e) => setCursorPosition(e.target.selectionStart)}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm resize-none focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        rows={3}
      />

      {/* Mention Suggestions */}
      {showSuggestions && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
          {suggestions.map((user, index) => (
            <button
              key={user.id}
              onClick={() => insertMention(user)}
              className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-indigo-50 transition-colors ${
                index === selectedIndex ? 'bg-indigo-50' : ''
              }`}
            >
              <div className="w-6 h-6 bg-indigo-100 rounded-full flex items-center justify-center text-xs font-bold text-indigo-600">
                {user.displayName.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-900 truncate">{user.displayName}</div>
                <div className="text-xs text-slate-500 truncate">{user.email}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
