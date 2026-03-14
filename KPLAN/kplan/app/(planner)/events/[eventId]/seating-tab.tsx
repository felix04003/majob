'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2, X, Eye, PenLine, Users, ArrowDown } from 'lucide-react';
import Seating3DView from './seating-3d-view';

type SeatingTable = {
  id: string;
  label: string;
  shape: 'round' | 'rectangle' | 'long';
  capacity: number;
  pos_x: number;
  pos_y: number;
};

type GuestInfo = {
  id: string;
  first_name: string;
  last_name: string;
  rsvp_status: string;
};

type Assignment = {
  table_id: string;
  guest_id: string;
  seat_number: number | null;
};

interface SeatingTabProps {
  eventId: string;
}

export default function SeatingTab({ eventId }: SeatingTabProps) {
  const canvasRef = useRef<HTMLDivElement>(null);

  // State
  const [tables, setTables] = useState<SeatingTable[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [unassignedGuests, setUnassignedGuests] = useState<GuestInfo[]>([]);
  const [allGuests, setAllGuests] = useState<Map<string, GuestInfo>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [editingTable, setEditingTable] = useState<SeatingTable | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [guestFilter, setGuestFilter] = useState('');
  const [draggedGuest, setDraggedGuest] = useState<string | null>(null);
  const [draggingTable, setDraggingTable] = useState<string | null>(null);
  const [view3d, setView3d] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Mobile: tap-to-assign mode
  const [selectedGuest, setSelectedGuest] = useState<string | null>(null);
  // Mobile: show guest panel (stacked layout)
  const [mobilePanel, setMobilePanel] = useState<'canvas' | 'guests'>('canvas');

  // Form state for dialog
  const [formData, setFormData] = useState({
    label: '',
    shape: 'round' as 'round' | 'rectangle' | 'long',
    capacity: 8,
  });

  // Detect touch device
  const isTouchDevice = typeof window !== 'undefined' && 'ontouchstart' in window;

  // Load data on mount
  useEffect(() => {
    loadSeatingData();
  }, [eventId]);

  const loadSeatingData = async () => {
    try {
      setLoading(true);
      const res = await fetch(
        `/api/planner/events/${eventId}/seating`
      );
      if (!res.ok) throw new Error('Failed to load seating data');

      const data = await res.json();
      setTables(data.tables || []);
      setAssignments(data.assignments || []);
      setUnassignedGuests(data.unassignedGuests || []);

      // Build allGuests map
      const guestMap = new Map<string, GuestInfo>();
      if (data.unassignedGuests) {
        data.unassignedGuests.forEach((guest: GuestInfo) => {
          guestMap.set(guest.id, guest);
        });
      }

      // Add assigned guests to map
      if (data.assignments && data.allGuests) {
        data.allGuests.forEach((guest: GuestInfo) => {
          guestMap.set(guest.id, guest);
        });
      }

      setAllGuests(guestMap);
      setDirty(false);
    } catch (error) {
      console.error('Error loading seating data:', error);
      toast.error('Erreur lors du chargement des données');
      setTables([]);
      setAssignments([]);
      setUnassignedGuests([]);
      setAllGuests(new Map());
    } finally {
      setLoading(false);
    }
  };

  const saveSeating = async () => {
    try {
      setSaving(true);
      const res = await fetch(
        `/api/planner/events/${eventId}/seating`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tables, assignments }),
        }
      );

      if (!res.ok) throw new Error('Failed to save seating');

      toast.success('Plan de table enregistré');
      setDirty(false);
    } catch (error) {
      console.error('Error saving seating:', error);
      toast.error("Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  // Dialog handlers
  const openAddDialog = () => {
    setFormData({ label: '', shape: 'round', capacity: 8 });
    setEditingTable(null);
    setAddDialogOpen(true);
  };

  const openEditDialog = (table: SeatingTable) => {
    setEditingTable(table);
    setFormData({
      label: table.label,
      shape: table.shape,
      capacity: table.capacity,
    });
    setAddDialogOpen(true);
  };

  const saveTable = () => {
    if (!formData.label.trim()) {
      toast.error('Le nom de la table est requis');
      return;
    }

    if (editingTable) {
      setTables((prev) =>
        prev.map((t) =>
          t.id === editingTable.id ? { ...t, ...formData } : t
        )
      );
    } else {
      const newTable: SeatingTable = {
        id: crypto.randomUUID(),
        ...formData,
        pos_x: 50,
        pos_y: 50,
      };
      setTables((prev) => [...prev, newTable]);
    }

    setDirty(true);
    setAddDialogOpen(false);
  };

  const deleteTable = (tableId: string) => {
    if (!confirm('Supprimer cette table?')) return;

    setTables((prev) => prev.filter((t) => t.id !== tableId));
    setAssignments((prev) => prev.filter((a) => a.table_id !== tableId));
    setDirty(true);
  };

  // ──────────────────────────────────────────────
  //  Guest assignment (works for both drag & tap)
  // ──────────────────────────────────────────────

  const assignGuestToTable = useCallback(
    (guestId: string, tableId: string) => {
      const table = tables.find((t) => t.id === tableId);
      if (!table) return;

      const tableAssignmentCount = assignments.filter(
        (a) => a.table_id === tableId
      ).length;

      if (tableAssignmentCount >= table.capacity) {
        toast.error('Cette table est pleine');
        return;
      }

      setAssignments((prev) => {
        const filtered = prev.filter((a) => a.guest_id !== guestId);
        return [
          ...filtered,
          { table_id: tableId, guest_id: guestId, seat_number: null },
        ];
      });

      setUnassignedGuests((prev) => prev.filter((g) => g.id !== guestId));
      setSelectedGuest(null);
      setDirty(true);
    },
    [tables, assignments]
  );

  const unassignGuest = useCallback(
    (guestId: string) => {
      setAssignments((prev) => prev.filter((a) => a.guest_id !== guestId));
      if (!unassignedGuests.find((g) => g.id === guestId)) {
        const guest = allGuests.get(guestId);
        if (guest) {
          setUnassignedGuests((prev) => [...prev, guest]);
        }
      }
      setDirty(true);
    },
    [unassignedGuests, allGuests]
  );

  // ──────────────────────────────────────────────
  //  HTML5 Drag & Drop (desktop)
  // ──────────────────────────────────────────────

  const handleGuestDragStart = (
    e: React.DragEvent<HTMLDivElement>,
    guestId: string
  ) => {
    setDraggedGuest(guestId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('guest_id', guestId);
  };

  const handleGuestDragEnd = () => {
    setDraggedGuest(null);
  };

  const handleUnassignedDropZoneDragOver = (
    e: React.DragEvent<HTMLDivElement>
  ) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleUnassignedDropZoneDrop = (
    e: React.DragEvent<HTMLDivElement>
  ) => {
    e.preventDefault();
    const guestId = e.dataTransfer.getData('guest_id');
    if (guestId) {
      unassignGuest(guestId);
    }
  };

  // ──────────────────────────────────────────────
  //  Table dragging (mouse + touch)
  // ──────────────────────────────────────────────

  const handleTableDragStart = (
    e: React.MouseEvent<HTMLDivElement>,
    tableId: string
  ) => {
    if (!canvasRef.current) return;
    setDraggingTable(tableId);
  };

  const updateTablePosition = (clientX: number, clientY: number) => {
    if (!draggingTable || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const newPos_x = Math.max(0, Math.min(100, (x / rect.width) * 100));
    const newPos_y = Math.max(0, Math.min(100, (y / rect.height) * 100));

    setTables((prev) =>
      prev.map((t) =>
        t.id === draggingTable
          ? { ...t, pos_x: newPos_x, pos_y: newPos_y }
          : t
      )
    );
    setDirty(true);
  };

  const handleTableMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    updateTablePosition(e.clientX, e.clientY);
  };

  const handleTableMouseUp = () => {
    setDraggingTable(null);
  };

  // Touch handlers for table dragging
  const handleTableTouchStart = (
    e: React.TouchEvent<HTMLDivElement>,
    tableId: string
  ) => {
    // Don't start drag if a guest is selected (tap-assign mode)
    if (selectedGuest) return;
    e.preventDefault();
    setDraggingTable(tableId);
  };

  const handleCanvasTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!draggingTable) return;
    e.preventDefault();
    const touch = e.touches[0];
    updateTablePosition(touch.clientX, touch.clientY);
  };

  const handleCanvasTouchEnd = () => {
    setDraggingTable(null);
  };

  // Table drop handlers (desktop)
  const handleTableDragOverGuest = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleTableDropGuest = (
    e: React.DragEvent<HTMLDivElement>,
    tableId: string
  ) => {
    e.preventDefault();
    const guestId = e.dataTransfer.getData('guest_id');
    if (!guestId) return;
    assignGuestToTable(guestId, tableId);
  };

  // ──────────────────────────────────────────────
  //  Tap-to-assign (mobile)
  // ──────────────────────────────────────────────

  const handleGuestTap = (guestId: string) => {
    if (selectedGuest === guestId) {
      setSelectedGuest(null); // deselect
    } else {
      setSelectedGuest(guestId);
      // On mobile, switch to canvas so user can tap a table
      setMobilePanel('canvas');
      toast.info('Tapez sur une table pour placer l\'invité', { duration: 2000 });
    }
  };

  const handleTableTap = (tableId: string) => {
    if (selectedGuest) {
      assignGuestToTable(selectedGuest, tableId);
      toast.success('Invité placé !');
    }
  };

  // ──────────────────────────────────────────────
  //  Helpers
  // ──────────────────────────────────────────────

  const getTableAssignedGuests = (tableId: string): GuestInfo[] => {
    return assignments
      .filter((a) => a.table_id === tableId)
      .map((a) => allGuests.get(a.guest_id))
      .filter(Boolean) as GuestInfo[];
  };

  const getTableCapacityInfo = (
    tableId: string
  ): { assigned: number; capacity: number } => {
    const table = tables.find((t) => t.id === tableId);
    const assigned = assignments.filter(
      (a) => a.table_id === tableId
    ).length;
    return {
      assigned,
      capacity: table?.capacity || 0,
    };
  };

  const filteredUnassigned = unassignedGuests.filter((g) => {
    if (!guestFilter) return true;
    const search = guestFilter.toLowerCase();
    return (
      (g.first_name ?? '').toLowerCase().includes(search) ||
      (g.last_name ?? '').toLowerCase().includes(search)
    );
  });

  const totalPlaced = assignments.length;
  const totalGuests = unassignedGuests.length + assignments.length;
  const percentPlaced =
    totalGuests > 0 ? Math.round((totalPlaced / totalGuests) * 100) : 0;

  // Table shape class (responsive sizes)
  const tableShapeClass = (shape: string) => {
    switch (shape) {
      case 'round':
        return 'rounded-full w-24 h-24 md:w-32 md:h-32';
      case 'rectangle':
        return 'rounded-lg w-28 h-20 md:w-40 md:h-24';
      case 'long':
        return 'rounded-lg w-36 h-16 md:w-56 md:h-20';
      default:
        return 'rounded-full w-24 h-24 md:w-32 md:h-32';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (view3d) {
    return (
      <Seating3DView
        tables={tables}
        assignments={assignments}
        allGuests={allGuests}
        onClose={() => setView3d(false)}
      />
    );
  }

  // ──────────────────────────────────────────────
  //  Guest sidebar content (shared between desktop sidebar & mobile panel)
  // ──────────────────────────────────────────────

  const guestListContent = (
    <>
      <div className="p-4 border-b sticky top-0 z-10 bg-gray-50">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm">Invités non placés</h3>
          <Badge
            variant="secondary"
            className="text-xs bg-blue-100 text-blue-700"
          >
            {unassignedGuests.length}
          </Badge>
        </div>
        <Input
          placeholder="Chercher..."
          value={guestFilter}
          onChange={(e) => setGuestFilter(e.target.value)}
          className="h-8 text-sm"
        />
        {selectedGuest && (
          <div className="mt-2 flex items-center gap-2 p-2 rounded-md bg-blue-50 border border-blue-200 text-xs text-blue-800">
            <span className="font-medium">
              {allGuests.get(selectedGuest)?.first_name}{' '}
              {allGuests.get(selectedGuest)?.last_name}
            </span>
            <span>sélectionné</span>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto h-6 px-2 text-xs"
              onClick={() => setSelectedGuest(null)}
            >
              Annuler
            </Button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
        {filteredUnassigned.length === 0 ? (
          <p className="text-xs text-gray-500 text-center py-4">
            {guestFilter
              ? 'Aucun invité trouvé'
              : 'Tous les invités sont placés'}
          </p>
        ) : (
          filteredUnassigned.map((guest, idx) => (
            <div
              key={guest.id ?? `guest-${idx}`}
              draggable={!isTouchDevice}
              onDragStart={(e) => handleGuestDragStart(e, guest.id)}
              onDragEnd={handleGuestDragEnd}
              onClick={() => handleGuestTap(guest.id)}
              className={`bg-white border rounded-md px-3 py-2 text-sm transition-all select-none
                ${!isTouchDevice ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer active:scale-95'}
                ${
                  selectedGuest === guest.id
                    ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-300'
                    : draggedGuest === guest.id
                      ? 'opacity-50 border-blue-400'
                      : 'border-gray-200 hover:border-blue-300 hover:shadow-sm'
                }
              `}
            >
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold shrink-0">
                  {(guest.first_name ?? '?')[0]}
                </div>
                <span className="font-medium text-gray-900 truncate">
                  {guest.first_name} {guest.last_name}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      <div
        onDragOver={handleUnassignedDropZoneDragOver}
        onDrop={handleUnassignedDropZoneDrop}
        className="p-3 border-t border-dashed border-gray-300 bg-gray-100 text-xs text-gray-500 text-center"
      >
        {isTouchDevice
          ? 'Tapez un invité dans une table pour le retirer'
          : 'Déposer ici pour retirer de la table'}
      </div>
    </>
  );

  // ──────────────────────────────────────────────
  //  Canvas content
  // ──────────────────────────────────────────────

  const canvasContent = (
    <div
      ref={canvasRef}
      onMouseMove={handleTableMouseMove}
      onMouseUp={handleTableMouseUp}
      onMouseLeave={handleTableMouseUp}
      onTouchMove={handleCanvasTouchMove}
      onTouchEnd={handleCanvasTouchEnd}
      className={`flex-1 relative min-h-64 md:min-h-96 bg-slate-50 overflow-hidden rounded-lg border ${
        selectedGuest ? 'ring-2 ring-blue-300 ring-offset-2' : ''
      }`}
      style={{
        backgroundImage: `
          linear-gradient(0deg, transparent 24%, rgba(0,0,0,.05) 25%, rgba(0,0,0,.05) 26%, transparent 27%, transparent 74%, rgba(0,0,0,.05) 75%, rgba(0,0,0,.05) 76%, transparent 77%, transparent),
          linear-gradient(90deg, transparent 24%, rgba(0,0,0,.05) 25%, rgba(0,0,0,.05) 26%, transparent 27%, transparent 74%, rgba(0,0,0,.05) 75%, rgba(0,0,0,.05) 76%, transparent 77%, transparent)
        `,
        backgroundSize: '50px 50px',
        touchAction: draggingTable ? 'none' : 'auto',
      }}
    >
      {/* Hint when guest is selected */}
      {selectedGuest && (
        <div className="absolute top-2 left-2 right-2 z-20 flex items-center justify-center">
          <div className="bg-blue-600 text-white text-xs font-medium px-3 py-1.5 rounded-full shadow-lg animate-in fade-in zoom-in-95">
            <ArrowDown className="w-3 h-3 inline mr-1" />
            Tapez sur une table pour placer{' '}
            <strong>
              {allGuests.get(selectedGuest)?.first_name}
            </strong>
          </div>
        </div>
      )}

      {tables.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <p className="text-gray-500 mb-4">
              Commencez par ajouter une table
            </p>
            <Button onClick={openAddDialog}>
              <Plus className="w-4 h-4 mr-1" />
              Créer une table
            </Button>
          </div>
        </div>
      ) : (
        tables.map((table) => {
          const { assigned, capacity } = getTableCapacityInfo(table.id);
          const isFull = assigned >= capacity;
          const guestList = getTableAssignedGuests(table.id);

          const borderColor = isFull
            ? 'border-amber-400 bg-amber-50'
            : selectedGuest
              ? 'border-blue-300 bg-blue-50/50 hover:border-blue-500'
              : 'border-green-300 bg-green-50';

          return (
            <div
              key={table.id}
              className="absolute"
              style={{
                left: `${table.pos_x}%`,
                top: `${table.pos_y}%`,
                transform: 'translate(-50%, -50%)',
              }}
            >
              <div
                onMouseDown={(e) => handleTableDragStart(e, table.id)}
                onTouchStart={(e) => handleTableTouchStart(e, table.id)}
                onDragOver={handleTableDragOverGuest}
                onDrop={(e) => handleTableDropGuest(e, table.id)}
                onClick={() => handleTableTap(table.id)}
                className={`
                  border-2 p-2 md:p-3
                  transition-all flex flex-col items-center justify-center
                  ${!selectedGuest ? 'cursor-move' : isFull ? 'cursor-not-allowed' : 'cursor-pointer'}
                  ${tableShapeClass(table.shape)}
                  ${borderColor}
                  ${selectedGuest && !isFull ? 'shadow-lg scale-105' : ''}
                `}
              >
                <div className="font-bold text-xs md:text-sm text-gray-900 text-center leading-tight">
                  {table.label}
                </div>

                <div
                  className={`text-[10px] md:text-xs font-semibold ${
                    isFull ? 'text-amber-700' : 'text-green-700'
                  }`}
                >
                  {assigned}/{capacity}
                </div>

                <div className="text-[10px] md:text-xs text-gray-700 text-center max-w-full hidden md:block">
                  {guestList.length === 0 ? (
                    <span className="text-gray-500 italic">Vide</span>
                  ) : guestList.length <= 2 ? (
                    <div className="space-y-0.5">
                      {guestList.map((g) => (
                        <div key={g.id}>
                          {g.first_name} {g.last_name}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <>
                      <div>{guestList[0].first_name}</div>
                      <div className="text-gray-600">
                        +{guestList.length - 1}
                      </div>
                    </>
                  )}
                </div>

                {/* Mobile: just show count */}
                <div className="text-[10px] text-gray-600 md:hidden">
                  {guestList.length > 0
                    ? `${guestList[0].first_name?.charAt(0)}. +${guestList.length - 1}`
                    : ''}
                </div>

                {/* Delete button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteTable(table.id);
                  }}
                  className="absolute -top-2 -right-2 bg-red-100 hover:bg-red-200 rounded-full p-1 opacity-0 hover:opacity-100 md:transition-opacity"
                  title="Supprimer la table"
                >
                  <X className="w-3 h-3 text-red-700" />
                </button>
              </div>

              {/* Edit label click */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openEditDialog(table);
                }}
                className="absolute top-0 left-0 right-0 h-6 md:h-8 opacity-0 hover:opacity-100 transition-opacity bg-blue-50 text-blue-700 text-xs font-medium rounded-t-lg flex items-center justify-center"
              >
                Éditer
              </button>
            </div>
          );
        })
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Top action bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 border rounded-lg bg-white">
        <div className="text-sm font-medium text-gray-700">
          {tables.length} table{tables.length !== 1 ? 's' : ''} —{' '}
          {totalPlaced} / {totalGuests} invités ({percentPlaced}%)
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setView3d(true)}
            disabled={tables.length === 0}
          >
            <Eye className="w-4 h-4 mr-1" />
            <span className="hidden sm:inline">Vue</span> 3D
          </Button>
          <Button size="sm" variant="outline" onClick={openAddDialog}>
            <Plus className="w-4 h-4 mr-1" />
            <span className="hidden sm:inline">Ajouter une</span> table
          </Button>
          <Button
            size="sm"
            onClick={saveSeating}
            disabled={!dirty || saving}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Enregistrer
          </Button>
        </div>
      </div>

      {/* Mobile Panel Toggle */}
      <div className="flex gap-2 md:hidden">
        <Button
          size="sm"
          variant={mobilePanel === 'canvas' ? 'default' : 'outline'}
          className="flex-1"
          onClick={() => setMobilePanel('canvas')}
        >
          Plan de table
        </Button>
        <Button
          size="sm"
          variant={mobilePanel === 'guests' ? 'default' : 'outline'}
          className="flex-1"
          onClick={() => setMobilePanel('guests')}
        >
          <Users className="w-4 h-4 mr-1" />
          Invités
          {unassignedGuests.length > 0 && (
            <Badge variant="secondary" className="ml-1 text-xs">
              {unassignedGuests.length}
            </Badge>
          )}
        </Button>
      </div>

      {/* Desktop layout: side by side */}
      <div className="hidden md:flex gap-4 max-h-[calc(100vh-300px)]">
        {/* Left Sidebar */}
        <div className="w-80 flex flex-col border rounded-lg bg-gray-50">
          {guestListContent}
        </div>

        {/* Right Canvas Area */}
        <div className="flex-1 flex flex-col">{canvasContent}</div>
      </div>

      {/* Mobile layout: stacked with toggle */}
      <div className="md:hidden">
        {mobilePanel === 'canvas' ? (
          <div className="flex flex-col" style={{ minHeight: '60vh' }}>
            {canvasContent}
          </div>
        ) : (
          <div
            className="flex flex-col border rounded-lg bg-gray-50"
            style={{ maxHeight: '60vh' }}
          >
            {guestListContent}
          </div>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {editingTable ? 'Éditer la table' : 'Ajouter une table'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium mb-1 block">
                Nom de la table
              </label>
              <Input
                value={formData.label}
                onChange={(e) =>
                  setFormData({ ...formData, label: e.target.value })
                }
                placeholder="ex: Table 1"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Forme</label>
              <div className="flex gap-2">
                {(
                  ['round', 'rectangle', 'long'] as const
                ).map((shape) => (
                  <Button
                    key={shape}
                    variant={
                      formData.shape === shape ? 'default' : 'outline'
                    }
                    size="sm"
                    onClick={() => setFormData({ ...formData, shape })}
                    className="flex-1"
                  >
                    {shape === 'round'
                      ? 'Ronde'
                      : shape === 'rectangle'
                        ? 'Rect.'
                        : 'Longue'}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">
                Capacité
              </label>
              <Input
                type="number"
                min="1"
                max="50"
                value={formData.capacity}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    capacity: parseInt(e.target.value) || 1,
                  })
                }
              />
            </div>
          </div>

          <DialogFooter>
            {editingTable && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  deleteTable(editingTable.id);
                  setAddDialogOpen(false);
                }}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Supprimer
              </Button>
            )}

            <Button
              variant="outline"
              onClick={() => setAddDialogOpen(false)}
            >
              Annuler
            </Button>

            <Button onClick={saveTable}>
              {editingTable ? 'Mettre à jour' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
