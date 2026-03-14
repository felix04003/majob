'use client';

import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, Eye, Loader2, Upload, ImageIcon, X, Palette, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';

import {
  templates,
  getTemplate,
  categoryLabels,
  type InvitationTemplate,
  type InvitationCustom,
} from '@/lib/invitation-templates';

interface InvitationTabProps {
  eventId: string;
}

interface EventData {
  id: string;
  invitation_template: string;
  invitation_custom: InvitationCustom;
  invitation_image_url: string | null;
  canva_design_id: string | null;
}

interface ProgramItem {
  time: string;
  label: string;
}

type DesignMode = 'templates' | 'custom';

export default function InvitationTab({ eventId }: InvitationTabProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('elegant-classic');
  const [customization, setCustomization] = useState<InvitationCustom>({
    message: '',
    program: [],
    hideCountdown: false,
    hideProgram: false,
  });
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [hasInvites, setHasInvites] = useState(false);
  const [programInputs, setProgramInputs] = useState<ProgramItem[]>([]);
  const [designMode, setDesignMode] = useState<DesignMode>('templates');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch event data on mount
  useEffect(() => {
    const fetchEventData = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/planner/events/${eventId}`);
        if (!response.ok) throw new Error('Failed to fetch event data');

        const json = await response.json();
        const data: EventData = json.event ?? json;
        setSelectedTemplate(data.invitation_template || 'elegant-classic');
        setImageUrl(data.invitation_image_url || null);
        setCustomization(
          data.invitation_custom || {
            message: '',
            program: [],
            hideCountdown: false,
            hideProgram: false,
          }
        );
        setProgramInputs(data.invitation_custom?.program || []);
        // Auto-detect design mode
        if (data.invitation_image_url) {
          setDesignMode('custom');
        }
      } catch (error) {
        toast.error('Erreur lors du chargement des données');
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    fetchEventData();
  }, [eventId]);

  // Fetch invites to check if any exist
  useEffect(() => {
    const fetchInvites = async () => {
      try {
        const response = await fetch(`/api/planner/events/${eventId}/invites`);
        if (response.ok) {
          const json = await response.json();
          const guests = json.guests ?? [];
          setHasInvites(Array.isArray(guests) && guests.length > 0);
        }
      } catch (error) {
        console.error('Failed to fetch invites:', error);
      }
    };

    fetchInvites();
  }, [eventId]);

  // Handle template selection
  const handleSelectTemplate = async (templateId: string) => {
    try {
      setSelectedTemplate(templateId);
      const response = await fetch(`/api/planner/events/${eventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invitation_template: templateId }),
      });

      if (!response.ok) throw new Error('Failed to update template');
      toast.success('Template sélectionné');
    } catch (error) {
      toast.error('Erreur lors de la sélection du template');
      console.error(error);
    }
  };

  // Handle image upload
  const handleImageUpload = async (file: File) => {
    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`/api/planner/events/${eventId}/upload-image`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Upload failed');
      }

      const { url } = await response.json();
      setImageUrl(url);
      toast.success('Image uploadée avec succès');
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de l\'upload');
      console.error(error);
    } finally {
      setUploading(false);
    }
  };

  // Handle image removal
  const handleRemoveImage = async () => {
    try {
      const response = await fetch(`/api/planner/events/${eventId}/upload-image`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to remove image');
      setImageUrl(null);
      toast.success('Image supprimée');
    } catch (error) {
      toast.error('Erreur lors de la suppression');
      console.error(error);
    }
  };

  // Handle customization save
  const handleSaveCustomization = async () => {
    try {
      setSaving(true);
      const payload: InvitationCustom = {
        message: customization.message,
        program: programInputs,
        hideCountdown: customization.hideCountdown,
        hideProgram: customization.hideProgram,
      };

      const response = await fetch(`/api/planner/events/${eventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invitation_custom: payload }),
      });

      if (!response.ok) throw new Error('Failed to save customization');
      setCustomization(payload);
      toast.success('Personnalisation enregistrée');
    } catch (error) {
      toast.error('Erreur lors de la sauvegarde');
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  // Handle preview
  const handlePreview = async () => {
    try {
      const response = await fetch(`/api/planner/events/${eventId}/invites`);
      if (!response.ok) throw new Error('Failed to fetch invites');

      const json = await response.json();
      const guests = json.guests ?? [];
      if (!Array.isArray(guests) || guests.length === 0) {
        toast.error('Aucune invitation trouvée. Créez des invitations d\'abord.');
        return;
      }

      const firstGuest = guests[0];
      const token = firstGuest.invitation?.invite_token;
      if (token) {
        window.open(`/i/${token}`, '_blank');
      } else {
        toast.error("Lien d'invitation non disponible");
      }
    } catch (error) {
      toast.error("Erreur lors de l'ouverture de l'aperçu");
      console.error(error);
    }
  };

  // Filter templates by category
  const filteredTemplates =
    selectedCategory === 'all'
      ? templates
      : templates.filter((t) => t.category === selectedCategory);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="mr-2 h-6 w-6 animate-spin" />
        <span>Chargement...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Design Mode Toggle */}
      <div className="flex gap-2">
        <Button
          variant={designMode === 'templates' ? 'default' : 'outline'}
          onClick={() => setDesignMode('templates')}
          className="flex-1"
        >
          <Palette className="mr-2 h-4 w-4" />
          Templates intégrés
        </Button>
        <Button
          variant={designMode === 'custom' ? 'default' : 'outline'}
          onClick={() => setDesignMode('custom')}
          className="flex-1"
        >
          <Sparkles className="mr-2 h-4 w-4" />
          Design personnalisé
        </Button>
      </div>

      {/* === TEMPLATES MODE === */}
      {designMode === 'templates' && (
        <>
          {/* Category Filter Tabs */}
          <div className="flex flex-wrap gap-2">
            {['all', 'classique', 'nature', 'moderne', 'luxe', 'créatif'].map((cat) => (
              <Button
                key={cat}
                variant={selectedCategory === cat ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedCategory(cat)}
                className="capitalize"
              >
                {cat === 'all'
                  ? 'Tous'
                  : categoryLabels[cat as keyof typeof categoryLabels] || cat}
              </Button>
            ))}
          </div>

          {/* Template Gallery */}
          <div>
            <h3 className="mb-4 text-lg font-semibold">Sélectionner un template</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredTemplates.map((template) => {
                const isSelected = selectedTemplate === template.id;
                return (
                  <button
                    key={template.id}
                    onClick={() => handleSelectTemplate(template.id)}
                    className={`overflow-hidden rounded-lg text-left transition-all ${
                      isSelected ? 'ring-2 ring-primary' : ''
                    }`}
                  >
                    <Card className={isSelected ? 'border-primary' : ''}>
                      <div
                        className={`relative h-40 bg-gradient-to-br ${template.bgGradient} p-4 text-white`}
                      >
                        <div
                          className={`mb-2 text-xl font-bold ${template.titleFont} ${template.titleStyle}`}
                        >
                          {template.name}
                        </div>
                        <div className="text-sm opacity-75">{template.preview}</div>
                        <div
                          className={`absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r ${template.accentGradient}`}
                        />
                      </div>
                      <CardContent className="pt-3">
                        <p className="text-sm font-medium">{template.name}</p>
                        <Badge variant="secondary" className="mt-2">
                          {categoryLabels[template.category as keyof typeof categoryLabels]}
                        </Badge>
                      </CardContent>
                    </Card>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* === CUSTOM DESIGN MODE === */}
      {designMode === 'custom' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5" />
              Design personnalisé
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Uploadez une image créée avec Canva, Figma ou tout autre outil de design.
              Elle sera utilisée comme visuel principal de l&apos;invitation.
            </p>

            {/* Current Image Preview */}
            {imageUrl && (
              <div className="relative rounded-lg overflow-hidden border">
                <img
                  src={imageUrl}
                  alt="Design d'invitation"
                  className="w-full max-h-80 object-cover"
                />
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute top-2 right-2"
                  onClick={handleRemoveImage}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* Upload Area */}
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                uploading ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const file = e.dataTransfer.files[0];
                if (file) handleImageUpload(file);
              }}
            >
              {uploading ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Upload en cours...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">
                      Glissez une image ici ou{' '}
                      <button
                        className="text-primary underline"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        parcourez vos fichiers
                      </button>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      PNG, JPG, WebP ou SVG — max 5 Mo
                    </p>
                  </div>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageUpload(file);
                  e.target.value = '';
                }}
              />
            </div>

            {/* Canva Tips */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                Astuce Canva
              </h4>
              <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Ouvrez Canva et créez un design d&apos;invitation (recommandé : 1200x800px)</li>
                <li>Personnalisez les couleurs, images et textes selon le thème de l&apos;événement</li>
                <li>Exportez en PNG haute qualité</li>
                <li>Uploadez l&apos;image ici</li>
              </ol>
            </div>

            {/* Template selection still applies for styling interactive sections */}
            <div className="pt-2 border-t">
              <p className="text-sm text-muted-foreground mb-3">
                Le template ci-dessous est utilisé pour styliser les sections interactives
                (RSVP, programme, informations).
              </p>
              <div className="flex flex-wrap gap-2">
                {templates.slice(0, 6).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleSelectTemplate(t.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                      selectedTemplate === t.id
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted hover:bg-muted/80'
                    }`}
                  >
                    {t.name}
                  </button>
                ))}
                {templates.length > 6 && (
                  <button
                    onClick={() => setDesignMode('templates')}
                    className="px-3 py-1.5 rounded-full text-xs font-medium bg-muted hover:bg-muted/80"
                  >
                    Voir tous...
                  </button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Customization Section (shared between both modes) */}
      <Card>
        <CardHeader>
          <CardTitle>Personnalisation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Custom Message */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Message personnalisé</label>
            <Textarea
              placeholder="Ajoutez un message personnalisé pour vos invités..."
              value={customization.message}
              onChange={(e) =>
                setCustomization({ ...customization, message: e.target.value })
              }
              className="min-h-24"
            />
          </div>

          {/* Program Editor */}
          <div className="space-y-3">
            <label className="text-sm font-medium">Programme</label>
            <div className="space-y-2">
              {programInputs.map((item, idx) => (
                <div key={idx} className="flex gap-2">
                  <Input
                    type="time"
                    value={item.time}
                    onChange={(e) => {
                      const updated = [...programInputs];
                      updated[idx].time = e.target.value;
                      setProgramInputs(updated);
                    }}
                    className="w-24"
                  />
                  <Input
                    placeholder="Description (ex: Cérémonie)"
                    value={item.label}
                    onChange={(e) => {
                      const updated = [...programInputs];
                      updated[idx].label = e.target.value;
                      setProgramInputs(updated);
                    }}
                    className="flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setProgramInputs(programInputs.filter((_, i) => i !== idx));
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setProgramInputs([...programInputs, { time: '', label: '' }]);
              }}
              className="w-full"
            >
              <Plus className="mr-2 h-4 w-4" />
              Ajouter un élément
            </Button>
          </div>

          {/* Toggle Switches */}
          <div className="space-y-3">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={!customization.hideCountdown}
                onChange={(e) =>
                  setCustomization({
                    ...customization,
                    hideCountdown: !e.target.checked,
                  })
                }
                className="h-4 w-4 rounded border-gray-300"
              />
              <span className="text-sm font-medium">Afficher le compte à rebours</span>
            </label>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={!customization.hideProgram}
                onChange={(e) =>
                  setCustomization({
                    ...customization,
                    hideProgram: !e.target.checked,
                  })
                }
                className="h-4 w-4 rounded border-gray-300"
              />
              <span className="text-sm font-medium">Afficher le programme</span>
            </label>
          </div>

          {/* Save Button */}
          <Button
            onClick={handleSaveCustomization}
            disabled={saving}
            className="w-full"
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Enregistrer la personnalisation
          </Button>
        </CardContent>
      </Card>

      {/* Preview Button */}
      <Button
        onClick={handlePreview}
        disabled={!hasInvites}
        variant="outline"
        className="w-full"
      >
        <Eye className="mr-2 h-4 w-4" />
        Prévisualiser l&apos;invitation
      </Button>
    </div>
  );
}
