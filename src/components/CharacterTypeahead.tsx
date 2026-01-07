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
  isSelected?: boolean
}

export default function CharacterTypeahead({
  value,
  onChange,
  onSelect,
  placeholder,
  disabled,
  existingEnabled = true,
  isSelected = false,
}: CharacterTypeaheadProps) {
  const [suggestions, setSuggestions] = useState<CreatedCharacter[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null)
  const [hasQuery, setHasQuery] = useState(false)
  const [repoVersion, setRepoVersion] = useState(0)
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
        setHasQuery(false)
        setSuggestions([])
        setShowSuggestions(false)
        setSelectedIndex(-1)
        return
      }

      setHasQuery(true)
      const results = await searchCharacters(query)
      setSuggestions(results)
      setShowSuggestions(true)
      setSelectedIndex(results.length ? 0 : -1)
    }

    const debounce = setTimeout(loadSuggestions, 200)
    return () => clearTimeout(debounce)
  }, [value, existingEnabled, repoVersion])

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

  useEffect(() => {
    const handler = () => setRepoVersion((v) => v + 1)
    window.addEventListener('pgs:characters-updated', handler)
    return () => window.removeEventListener('pgs:characters-updated', handler)
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions) return
    if (suggestions.length === 0) {
      if (e.key === 'Escape') {
        setShowSuggestions(false)
        setSelectedIndex(-1)
      }
      return
    }

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
          e.preventDefault()
          handleSelect(suggestions[selectedIndex])
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
    showSuggestions && dropdownRect
      ? createPortal(
          <div
            ref={dropdownRef}
            id="character-suggestions"
            role="listbox"
            className="pgs-typeahead pgs-typeahead__list"
            style={{
              position: 'fixed',
              top: dropdownRect.top,
              left: dropdownRect.left,
              width: dropdownRect.width,
              marginTop: '2px',
              maxHeight: '220px',
              zIndex: 99999,
            }}
          >
            {suggestions.map((char, idx) => (
              <div
                key={char.id}
                role="option"
                aria-selected={idx === selectedIndex}
                onClick={() => handleSelect(char)}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`pgs-typeahead__item${idx === selectedIndex ? ' is-active' : ''}`}
              >
                <div className="pgs-typeahead__row">
                  <span className="pgs-typeahead__tag">{char.tag}</span>
                  <span className="pgs-typeahead__name">{char.name}</span>
                </div>
                {(char.look || char.outfit) && (
                  <div className="pgs-typeahead__meta">
                    {char.look && <span>{char.look}</span>}
                    {char.outfit && <span>• {char.outfit}</span>}
                  </div>
                )}
              </div>
            ))}
            {hasQuery && suggestions.length === 0 && (
              <div className="pgs-typeahead__item pgs-typeahead__item--empty" role="option" aria-selected="false">
                No matches
              </div>
            )}
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
          background: isSelected ? '#FFD84D' : 'var(--bg)',
          color: isSelected ? '#111827' : 'var(--text)',
          border: isSelected ? '1px solid #d97706' : '1px solid var(--border)',
          borderRadius: '4px',
          padding: '0.3rem',
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
