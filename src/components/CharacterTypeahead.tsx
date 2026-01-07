import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CreatedCharacter } from '../db/types'
import { searchCharacters } from '../db/characterRepo'

interface CharacterTypeaheadProps {
  value: string
  onChange: (value: string) => void
  onSelect: (character: CreatedCharacter) => void
  placeholder?: string
  disabled?: boolean
  existingEnabled?: boolean
}

export default function CharacterTypeahead({
  value,
  onChange,
  onSelect,
  placeholder,
  disabled,
  existingEnabled = true,
}: CharacterTypeaheadProps) {
  const [suggestions, setSuggestions] = useState<CreatedCharacter[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const loadSuggestions = async () => {
      if (!existingEnabled) {
        setSuggestions([])
        setShowSuggestions(false)
        setSelectedIndex(-1)
        return
      }

      const query = value.trim()
      if (query.length <= 1) {
        setSuggestions([])
        setShowSuggestions(false)
        setSelectedIndex(-1)
        return
      }

      const results = await searchCharacters(query)
      setSuggestions(results)
      setShowSuggestions(results.length > 0)
      setSelectedIndex(results.length ? 0 : -1)
    }

    const debounce = setTimeout(loadSuggestions, 200)
    return () => clearTimeout(debounce)
  }, [value, existingEnabled])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!showSuggestions || !inputRef.current) {
      setDropdownRect(null)
      return
    }

    const updatePosition = () => {
      if (!inputRef.current) return
      const rect = inputRef.current.getBoundingClientRect()
      setDropdownRect({ top: rect.bottom + 2, left: rect.left, width: rect.width })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [showSuggestions, value])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex((prev) => {
          if (prev < suggestions.length - 1) return prev + 1
          return prev === -1 && suggestions.length > 0 ? 0 : prev
        })
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1))
        break
      case 'Enter':
        e.preventDefault()
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          handleSelect(suggestions[selectedIndex])
        }
        break
      case 'Tab':
        if (suggestions.length > 0 && selectedIndex === -1) {
          e.preventDefault()
          setSelectedIndex(0)
        } else if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          // Allow Tab to move focus once a selection is already highlighted
          setShowSuggestions(false)
        }
        break
      case 'Escape':
        e.preventDefault()
        setShowSuggestions(false)
        setSelectedIndex(-1)
        break
    }
  }

  const handleSelect = (character: CreatedCharacter) => {
    onChange(character.tag)
    onSelect(character)
    setShowSuggestions(false)
    setSelectedIndex(-1)
  }

  const dropdown =
    showSuggestions && suggestions.length > 0 && dropdownRect
      ? createPortal(
          <div
            ref={dropdownRef}
            id="character-suggestions"
            role="listbox"
            style={{
              position: 'fixed',
              top: dropdownRect.top,
              left: dropdownRect.left,
              width: dropdownRect.width,
              marginTop: '2px',
              background: 'var(--panel)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              maxHeight: '220px',
              overflowY: 'auto',
              zIndex: 99999,
              boxShadow: '0 8px 16px rgba(0,0,0,0.35)',
            }}
          >
            {suggestions.map((char, idx) => (
              <div
                key={char.id}
                role="option"
                aria-selected={idx === selectedIndex}
                onClick={() => handleSelect(char)}
                onMouseEnter={() => setSelectedIndex(idx)}
                style={{
                  padding: '0.55rem 0.6rem',
                  cursor: 'pointer',
                  background: idx === selectedIndex ? 'var(--accent)' : 'transparent',
                  color: idx === selectedIndex ? 'white' : 'var(--text)',
                  fontSize: '0.85rem',
                  borderBottom: idx < suggestions.length - 1 ? '1px solid var(--border)' : 'none',
                  display: 'grid',
                  gridTemplateColumns: '1fr',
                  gap: '0.15rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.35rem' }}>
                  <span style={{ fontWeight: 600 }}>{char.tag}</span>
                  <span style={{ fontSize: '0.8rem', opacity: 0.85 }}>{char.name}</span>
                </div>
                {(char.look || char.outfit) && (
                  <div style={{ fontSize: '0.75rem', opacity: 0.65, display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                    {char.look && <span>{char.look}</span>}
                    {char.outfit && <span style={{ opacity: 0.75 }}>• {char.outfit}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>,
          document.body
        )
      : null

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (existingEnabled && suggestions.length > 0) setShowSuggestions(true)
        }}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: '4px',
          padding: '0.3rem',
          color: 'var(--text)',
          fontSize: '0.85rem',
          width: '100%',
        }}
        aria-autocomplete="list"
        aria-controls="character-suggestions"
        aria-expanded={showSuggestions}
      />

      {dropdown}
    </div>
  )
}
