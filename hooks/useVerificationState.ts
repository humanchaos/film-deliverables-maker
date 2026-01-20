import { useState, useCallback, useEffect, useRef } from 'react';

interface CursorPosition {
    rowIndex: number;
    fieldId: string;
}

interface VerificationState<T> {
    data: T[];
    isDirty: boolean;
    cursor: CursorPosition | null;
    updateCell: (rowIndex: number, field: keyof T, value: any) => void;
    setCursor: (cursor: CursorPosition | null) => void;
    navigate: (direction: 'next' | 'prev' | 'up' | 'down') => void;
    save: () => void;
    reset: (newData: T[]) => void;
}

export function useVerificationState<T>(initialData: T[], onSave: (data: T[]) => void) {
    const [data, setData] = useState<T[]>(initialData);
    const [isDirty, setIsDirty] = useState(false);
    const [cursor, setCursor] = useState<CursorPosition | null>(null);

    // Track fields order for navigation
    const fieldsRef = useRef<string[]>([]);

    const registerFields = useCallback((fields: string[]) => {
        fieldsRef.current = fields;
    }, []);

    const updateCell = useCallback((rowIndex: number, field: keyof T, value: any) => {
        setData(prev => {
            const newData = [...prev];
            newData[rowIndex] = { ...newData[rowIndex], [field]: value };
            return newData;
        });
        setIsDirty(true);
    }, []);

    const save = useCallback(() => {
        onSave(data);
        setIsDirty(false);
    }, [data, onSave]);

    const reset = useCallback((newData: T[]) => {
        setData(newData);
        setIsDirty(false);
        setCursor(null);
    }, []);

    const navigate = useCallback((direction: 'next' | 'prev' | 'up' | 'down') => {
        if (!cursor) return;

        const { rowIndex, fieldId } = cursor;
        const fieldIndex = fieldsRef.current.indexOf(fieldId);
        if (fieldIndex === -1) return;

        let newRow = rowIndex;
        let newField = fieldIndex;

        switch (direction) {
            case 'next':
                if (fieldIndex < fieldsRef.current.length - 1) {
                    newField++;
                } else if (rowIndex < data.length - 1) {
                    newRow++;
                    newField = 0;
                }
                break;
            case 'prev':
                if (fieldIndex > 0) {
                    newField--;
                } else if (rowIndex > 0) {
                    newRow--;
                    newField = fieldsRef.current.length - 1;
                }
                break;
            case 'up':
                if (rowIndex > 0) newRow--;
                break;
            case 'down':
                if (rowIndex < data.length - 1) newRow++;
                break;
        }

        if (newRow !== rowIndex || newField !== fieldIndex) {
            setCursor({ rowIndex: newRow, fieldId: fieldsRef.current[newField] });
        }
    }, [cursor, data.length]);

    // Global Keyboard Shortcuts for Save
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault();
                save();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [save]);

    return {
        data,
        isDirty,
        cursor,
        setCursor,
        updateCell,
        navigate,
        save,
        reset,
        registerFields
    };
}
