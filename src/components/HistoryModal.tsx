// src/components/HistoryModal.tsx
// Modal para exibir histórico de cálculos no formato "armada"

import type { HistoryEntry } from '../types/calculator';
import '../styles/HistoryModal.css';

interface HistoryModalProps {
  history: HistoryEntry[];
  isOpen: boolean;
  onClose: () => void;
  onEntryClick: (entry: HistoryEntry) => void;
}

/**
 * Formata uma expressão no estilo "armada" melhorado
 * Ex: "400 + 170 + 2500 + 105 + 3000" -> 
 * ["400", "+ 170", "+ 2500", "+ 105", "+ 3000"]
 */
function formatExpressionArmada(expression: string): string[] {
  // Remove espaços extras
  const cleaned = expression.trim();
  
  // Divide por operadores mantendo-os na string
  const parts = cleaned.split(/\s*([+\-*/])\s*/);
  
  if (parts.length <= 1) {
    // Expressão simples sem operadores
    return [cleaned];
  }
  
  const lines: string[] = [];
  
  // Primeiro número (sem operador)
  lines.push(parts[0]);
  
  // Resto: operador + número
  for (let i = 1; i < parts.length; i += 2) {
    if (i + 1 < parts.length) {
      const operator = parts[i];
      const number = parts[i + 1];
      lines.push(`${operator} ${number}`);
    }
  }
  
  return lines;
}

export function HistoryModal({ history, isOpen, onClose, onEntryClick }: HistoryModalProps) {
  if (!isOpen) return null;

  return (
    <div className="history-modal-overlay" onClick={onClose}>
      <div className="history-modal" onClick={(e) => e.stopPropagation()}>
        <div className="history-modal-header">
          <h2>Histórico</h2>
          <button className="history-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="history-modal-content">
          {history.length === 0 ? (
            <div className="history-empty">
              Nenhum cálculo ainda
            </div>
          ) : (
            history.map((entry) => {
              const lines = formatExpressionArmada(entry.expression);

              return (
                <div 
                  key={entry.id} 
                  className="history-entry clickable"
                  onClick={() => {
                    onEntryClick(entry);
                    onClose();
                  }}
                >
                  <div className="history-expression">
                    {lines.map((line: string, idx: number) => (
                      <div key={idx} className="history-line">{line}</div>
                    ))}
                  </div>
                  <div className="history-divider">────────</div>
                  <div className="history-result">
                    <span className="history-result-main">{entry.resultFeetInches}</span>
                    <span className="history-result-alt">({entry.resultTotalInches})</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
