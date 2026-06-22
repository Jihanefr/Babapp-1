import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, FontWeight, Spacing, BorderRadius } from '../constants';
import { PLANNING_TYPE_CONFIG } from './TripPlanningSection';
import type { PlanningItemType, NewTripPlanningItem, TripPlanningItem } from '../services/tripPlanningItems';

const PLANNING_TYPES: PlanningItemType[] = [
  'flight', 'accommodation', 'activity', 'transport', 'other',
];

interface Props {
  visible: boolean;
  tripId: string;
  userId: string;
  editItem?: TripPlanningItem | null;
  onClose: () => void;
  onSubmit: (item: NewTripPlanningItem) => Promise<void>;
  onUpdate?: (id: string, updates: Partial<Pick<TripPlanningItem, 'title' | 'description' | 'location' | 'start_datetime' | 'end_datetime' | 'metadata'>>) => Promise<void>;
}

// ─── Reusable mini-components ──────────────────────────────────────────────────

function FieldLabel({ text, optional }: { text: string; optional?: boolean }) {
  return (
    <Text style={fs.label}>
      {text}
      {optional ? <Text style={fs.optional}> (optional)</Text> : null}
    </Text>
  );
}

function StyledInput({
  value, onChangeText, placeholder, multiline, numberOfLines,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  numberOfLines?: number;
}) {
  return (
    <TextInput
      style={[fs.input, multiline && fs.inputMulti]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={Colors.textLight}
      multiline={multiline}
      numberOfLines={numberOfLines}
      textAlignVertical={multiline ? 'top' : 'auto'}
    />
  );
}

function BookedToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={fs.toggleRow}>
      <View style={fs.toggleLeft}>
        <Ionicons name="checkmark-circle-outline" size={18} color={value ? '#10B981' : Colors.textLight} />
        <Text style={fs.toggleLabel}>Booked & confirmed?</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: Colors.border, true: '#10B981' }}
        thumbColor={Colors.white}
      />
    </View>
  );
}

function TypePills({
  options, value, onChange, color,
}: {
  options: { key: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  color: string;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingRight: 16 }}
      style={{ marginTop: 4 }}
    >
      {options.map((o) => {
        const active = value === o.key;
        return (
          <Pressable
            key={o.key}
            style={[fs.optPill, active && { backgroundColor: color, borderColor: color }]}
            onPress={() => onChange(o.key)}
          >
            <Text style={[fs.optPillText, active && { color: Colors.white }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ─── Per-type state shapes ─────────────────────────────────────────────────────

interface FlightState {
  title: string; airline: string; flightNumber: string;
  fromAirport: string; toAirport: string;
  departure: string; arrival: string;
  seat: string; confirmation: string; booked: boolean; notes: string;
}
interface AccomState {
  title: string; accomType: string; address: string;
  checkin: string; checkout: string;
  confirmation: string; booked: boolean; notes: string;
}
interface ActivityState {
  title: string; venue: string; address: string;
  startdt: string; enddt: string;
  confirmation: string; booked: boolean; notes: string;
}
interface TransportState {
  title: string; mode: string; from: string; to: string;
  datetime: string; seat: string; confirmation: string; notes: string;
}
interface OtherState { title: string; datetime: string; notes: string; }

const mkFlight  = (): FlightState   => ({ title:'',airline:'',flightNumber:'',fromAirport:'',toAirport:'',departure:'',arrival:'',seat:'',confirmation:'',booked:false,notes:'' });
const mkAccom   = (): AccomState    => ({ title:'',accomType:'hotel',address:'',checkin:'',checkout:'',confirmation:'',booked:false,notes:'' });
const mkActivity= (): ActivityState => ({ title:'',venue:'',address:'',startdt:'',enddt:'',confirmation:'',booked:false,notes:'' });
const mkTransport=():TransportState => ({ title:'',mode:'train',from:'',to:'',datetime:'',seat:'',confirmation:'',notes:'' });
const mkOther   = (): OtherState    => ({ title:'',datetime:'',notes:'' });

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatDateForInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseDate(str: string): string | null {
  if (!str.trim()) return null;
  const d = new Date(str.trim());
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function nightsBetween(a: string, b: string): number {
  const da = new Date(a), db = new Date(b);
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return 0;
  return Math.max(0, Math.round((db.getTime() - da.getTime()) / 86400000));
}

// ─── Main component ────────────────────────────────────────────────────────────

export function TripPlanningItemForm({ visible, tripId, userId, editItem, onClose, onSubmit, onUpdate }: Props) {
  const [itemType, setItemType] = useState<PlanningItemType>('flight');
  const [saving, setSaving] = useState(false);
  const [flight,   setFlight]   = useState<FlightState>(mkFlight());
  const [accom,    setAccom]    = useState<AccomState>(mkAccom());
  const [activity, setActivity] = useState<ActivityState>(mkActivity());
  const [transport,setTransport]= useState<TransportState>(mkTransport());
  const [other,    setOther]    = useState<OtherState>(mkOther());

  const isEditing = !!editItem;

  const reset = () => {
    setItemType('flight');
    setFlight(mkFlight()); setAccom(mkAccom());
    setActivity(mkActivity()); setTransport(mkTransport()); setOther(mkOther());
  };

  // Pre-fill state when opening in edit mode
  React.useEffect(() => {
    if (!visible) return;
    if (!editItem) { reset(); return; }
    const m = editItem.metadata ?? {};
    setItemType(editItem.item_type);
    if (editItem.item_type === 'flight') {
      setFlight({
        title: editItem.title,
        airline: String(m.airline ?? ''),
        flightNumber: String(m.flight_number ?? ''),
        fromAirport: String(m.from_airport ?? ''),
        toAirport: String(m.to_airport ?? ''),
        departure: formatDateForInput(editItem.start_datetime),
        arrival: formatDateForInput(editItem.end_datetime),
        seat: String(m.seat ?? ''),
        confirmation: String(m.confirmation ?? ''),
        booked: Boolean(m.booked),
        notes: editItem.description ?? '',
      });
    } else if (editItem.item_type === 'accommodation') {
      setAccom({
        title: editItem.title,
        accomType: String(m.accommodation_type ?? 'hotel'),
        address: String(m.address ?? ''),
        checkin: formatDateForInput(editItem.start_datetime),
        checkout: formatDateForInput(editItem.end_datetime),
        confirmation: String(m.confirmation ?? ''),
        booked: Boolean(m.booked),
        notes: editItem.description ?? '',
      });
    } else if (editItem.item_type === 'activity') {
      setActivity({
        title: editItem.title,
        venue: String(m.venue ?? ''),
        address: String(m.address ?? ''),
        startdt: formatDateForInput(editItem.start_datetime),
        enddt: formatDateForInput(editItem.end_datetime),
        confirmation: String(m.confirmation ?? ''),
        booked: Boolean(m.booked),
        notes: editItem.description ?? '',
      });
    } else if (editItem.item_type === 'transport') {
      setTransport({
        title: editItem.title,
        mode: String(m.mode ?? 'train'),
        from: String(m.from_location ?? ''),
        to: String(m.to_location ?? ''),
        datetime: formatDateForInput(editItem.start_datetime),
        seat: String(m.seat ?? ''),
        confirmation: String(m.confirmation ?? ''),
        notes: editItem.description ?? '',
      });
    } else {
      setOther({
        title: editItem.title,
        datetime: formatDateForInput(editItem.start_datetime),
        notes: editItem.description ?? '',
      });
    }
  }, [visible, editItem]);

  const handleClose = () => { reset(); onClose(); };

  const activeTitle = () => ({
    flight: flight.title, accommodation: accom.title, activity: activity.title,
    transport: transport.title, other: other.title,
  }[itemType]);

  const handleSave = async () => {
    if (!activeTitle().trim()) {
      Alert.alert('Title required', 'Please enter a name for this item.');
      return;
    }
    setSaving(true);
    let payload: NewTripPlanningItem;

    if (itemType === 'flight') {
      payload = {
        trip_id: tripId, user_id: userId, item_type: 'flight',
        title: flight.title.trim(),
        description: flight.notes.trim() || undefined,
        start_datetime: parseDate(flight.departure) ?? undefined,
        end_datetime:   parseDate(flight.arrival)   ?? undefined,
        metadata: {
          airline: flight.airline.trim() || null,
          flight_number: flight.flightNumber.trim() || null,
          from_airport: flight.fromAirport.trim() || null,
          to_airport: flight.toAirport.trim() || null,
          seat: flight.seat.trim() || null,
          confirmation: flight.confirmation.trim() || null,
          booked: flight.booked,
        },
      };
    } else if (itemType === 'accommodation') {
      const nights = nightsBetween(accom.checkin, accom.checkout);
      payload = {
        trip_id: tripId, user_id: userId, item_type: 'accommodation',
        title: accom.title.trim(),
        description: accom.notes.trim() || undefined,
        location: accom.address.trim() || undefined,
        start_datetime: parseDate(accom.checkin)  ?? undefined,
        end_datetime:   parseDate(accom.checkout) ?? undefined,
        metadata: {
          accommodation_type: accom.accomType,
          address: accom.address.trim() || null,
          nights: nights > 0 ? nights : null,
          confirmation: accom.confirmation.trim() || null,
          booked: accom.booked,
        },
      };
    } else if (itemType === 'activity') {
      payload = {
        trip_id: tripId, user_id: userId, item_type: 'activity',
        title: activity.title.trim(),
        description: activity.notes.trim() || undefined,
        location: activity.venue.trim() || undefined,
        start_datetime: parseDate(activity.startdt) ?? undefined,
        end_datetime:   parseDate(activity.enddt)   ?? undefined,
        metadata: {
          venue: activity.venue.trim() || null,
          address: activity.address.trim() || null,
          confirmation: activity.confirmation.trim() || null,
          booked: activity.booked,
        },
      };
    } else if (itemType === 'transport') {
      payload = {
        trip_id: tripId, user_id: userId, item_type: 'transport',
        title: transport.title.trim(),
        description: transport.notes.trim() || undefined,
        start_datetime: parseDate(transport.datetime) ?? undefined,
        metadata: {
          mode: transport.mode,
          from_location: transport.from.trim() || null,
          to_location: transport.to.trim() || null,
          seat: transport.seat.trim() || null,
          confirmation: transport.confirmation.trim() || null,
        },
      };
    } else {
      payload = {
        trip_id: tripId, user_id: userId, item_type: 'other',
        title: other.title.trim(),
        description: other.notes.trim() || undefined,
        start_datetime: parseDate(other.datetime) ?? undefined,
        metadata: {},
      };
    }

    if (isEditing && onUpdate && editItem) {
      await onUpdate(editItem.id, {
        title: payload.title,
        description: payload.description ?? null,
        location: (payload as any).location ?? null,
        start_datetime: payload.start_datetime ?? null,
        end_datetime: payload.end_datetime ?? null,
        metadata: payload.metadata,
      });
    } else {
      await onSubmit(payload);
    }
    setSaving(false);
    reset();
    onClose();
  };

  const cfg = PLANNING_TYPE_CONFIG[itemType];
  const typeName = cfg.label.endsWith('s') ? cfg.label.slice(0, -1) : cfg.label;
  const modalTitle = isEditing ? `Edit ${typeName}` : `Add ${typeName}`;
  const saveBtnLabel = isEditing ? 'Save Changes' : `Add ${typeName}`;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <Pressable style={styles.overlay} onPress={handleClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.sheet}
      >
        <View style={styles.handle} />
        <View style={styles.sheetHeader}>
          <View style={styles.sheetTitleRow}>
            <View style={[styles.sheetTitleIcon, { backgroundColor: cfg.color + '22' }]}>
              <Ionicons name={cfg.icon as any} size={18} color={cfg.color} />
            </View>
            <Text style={styles.sheetTitle}>{modalTitle}</Text>
          </View>
          <TouchableOpacity onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.formContent}
        >
          {/* ── Type selector ── */}
          <FieldLabel text="Type" />
          <ScrollView
            horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingRight: 16 }}
            style={{ marginBottom: Spacing.md }}
          >
            {PLANNING_TYPES.map((type) => {
              const tc = PLANNING_TYPE_CONFIG[type];
              const active = itemType === type;
              return (
                <Pressable
                  key={type}
                  style={[styles.typePill, active && { backgroundColor: tc.color, borderColor: tc.color }]}
                  onPress={() => setItemType(type)}
                >
                  <Ionicons name={tc.icon as any} size={14} color={active ? Colors.white : tc.color} />
                  <Text style={[styles.typePillText, active && { color: Colors.white }]}>
                    {tc.label.endsWith('s') ? tc.label.slice(0, -1) : tc.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* ── FLIGHT ── */}
          {itemType === 'flight' && (
            <>
              <FieldLabel text="Flight / Route name" />
              <StyledInput value={flight.title} onChangeText={(v) => setFlight({ ...flight, title: v })} placeholder="e.g. Paris → Tokyo" />
              <View style={styles.row}>
                <View style={styles.half}>
                  <FieldLabel text="Airline" optional />
                  <StyledInput value={flight.airline} onChangeText={(v) => setFlight({ ...flight, airline: v })} placeholder="e.g. Air France" />
                </View>
                <View style={styles.half}>
                  <FieldLabel text="Flight No." optional />
                  <StyledInput value={flight.flightNumber} onChangeText={(v) => setFlight({ ...flight, flightNumber: v })} placeholder="e.g. AF273" />
                </View>
              </View>
              <View style={styles.row}>
                <View style={styles.half}>
                  <FieldLabel text="From airport" optional />
                  <StyledInput value={flight.fromAirport} onChangeText={(v) => setFlight({ ...flight, fromAirport: v })} placeholder="e.g. CDG" />
                </View>
                <View style={styles.half}>
                  <FieldLabel text="To airport" optional />
                  <StyledInput value={flight.toAirport} onChangeText={(v) => setFlight({ ...flight, toAirport: v })} placeholder="e.g. NRT" />
                </View>
              </View>
              <View style={styles.row}>
                <View style={styles.half}>
                  <FieldLabel text="Departure" optional />
                  <StyledInput value={flight.departure} onChangeText={(v) => setFlight({ ...flight, departure: v })} placeholder="12 May 2025 09:00" />
                </View>
                <View style={styles.half}>
                  <FieldLabel text="Arrival" optional />
                  <StyledInput value={flight.arrival} onChangeText={(v) => setFlight({ ...flight, arrival: v })} placeholder="13 May 2025 06:30" />
                </View>
              </View>
              <View style={styles.row}>
                <View style={styles.half}>
                  <FieldLabel text="Seat" optional />
                  <StyledInput value={flight.seat} onChangeText={(v) => setFlight({ ...flight, seat: v })} placeholder="e.g. 24A" />
                </View>
                <View style={styles.half}>
                  <FieldLabel text="Confirmation #" optional />
                  <StyledInput value={flight.confirmation} onChangeText={(v) => setFlight({ ...flight, confirmation: v })} placeholder="e.g. XY12345" />
                </View>
              </View>
              <BookedToggle value={flight.booked} onChange={(v) => setFlight({ ...flight, booked: v })} />
              <FieldLabel text="Notes" optional />
              <StyledInput value={flight.notes} onChangeText={(v) => setFlight({ ...flight, notes: v })} placeholder="Any extra details…" multiline numberOfLines={3} />
            </>
          )}

          {/* ── ACCOMMODATION ── */}
          {itemType === 'accommodation' && (
            <>
              <FieldLabel text="Property name" />
              <StyledInput value={accom.title} onChangeText={(v) => setAccom({ ...accom, title: v })} placeholder="e.g. Hotel Shinjuku" />
              <FieldLabel text="Type" optional />
              <TypePills
                options={[
                  { key: 'hotel', label: 'Hotel' }, { key: 'airbnb', label: 'Airbnb' },
                  { key: 'hostel', label: 'Hostel' }, { key: 'resort', label: 'Resort' },
                  { key: 'apartment', label: 'Apartment' }, { key: 'other', label: 'Other' },
                ]}
                value={accom.accomType}
                onChange={(v) => setAccom({ ...accom, accomType: v })}
                color={PLANNING_TYPE_CONFIG.accommodation.color}
              />
              <FieldLabel text="Address" optional />
              <StyledInput value={accom.address} onChangeText={(v) => setAccom({ ...accom, address: v })} placeholder="e.g. 1-2-3 Shinjuku, Tokyo" />
              <View style={styles.row}>
                <View style={styles.half}>
                  <FieldLabel text="Check-in" optional />
                  <StyledInput value={accom.checkin} onChangeText={(v) => setAccom({ ...accom, checkin: v })} placeholder="12 May 2025" />
                </View>
                <View style={styles.half}>
                  <FieldLabel text="Check-out" optional />
                  <StyledInput value={accom.checkout} onChangeText={(v) => setAccom({ ...accom, checkout: v })} placeholder="15 May 2025" />
                </View>
              </View>
              {(() => {
                const n = nightsBetween(accom.checkin, accom.checkout);
                if (n <= 0) return null;
                return (
                  <View style={[styles.nightsBadge, { borderColor: PLANNING_TYPE_CONFIG.accommodation.color + '44' }]}>
                    <Ionicons name="moon-outline" size={14} color={PLANNING_TYPE_CONFIG.accommodation.color} />
                    <Text style={[styles.nightsText, { color: PLANNING_TYPE_CONFIG.accommodation.color }]}>
                      {n} night{n !== 1 ? 's' : ''}
                    </Text>
                  </View>
                );
              })()}
              <FieldLabel text="Confirmation #" optional />
              <StyledInput value={accom.confirmation} onChangeText={(v) => setAccom({ ...accom, confirmation: v })} placeholder="e.g. BK9876543" />
              <BookedToggle value={accom.booked} onChange={(v) => setAccom({ ...accom, booked: v })} />
              <FieldLabel text="Notes" optional />
              <StyledInput value={accom.notes} onChangeText={(v) => setAccom({ ...accom, notes: v })} placeholder="e.g. Late check-in requested…" multiline numberOfLines={3} />
            </>
          )}

          {/* ── ACTIVITY ── */}
          {itemType === 'activity' && (
            <>
              <FieldLabel text="Activity name" />
              <StyledInput value={activity.title} onChangeText={(v) => setActivity({ ...activity, title: v })} placeholder="e.g. Visit Senso-ji Temple" />
              <FieldLabel text="Venue" optional />
              <StyledInput value={activity.venue} onChangeText={(v) => setActivity({ ...activity, venue: v })} placeholder="e.g. Senso-ji Temple" />
              <FieldLabel text="Address" optional />
              <StyledInput value={activity.address} onChangeText={(v) => setActivity({ ...activity, address: v })} placeholder="e.g. 2-3-1 Asakusa, Tokyo" />
              <View style={styles.row}>
                <View style={styles.half}>
                  <FieldLabel text="Start date/time" optional />
                  <StyledInput value={activity.startdt} onChangeText={(v) => setActivity({ ...activity, startdt: v })} placeholder="12 May 2025 10:00" />
                </View>
                <View style={styles.half}>
                  <FieldLabel text="End date/time" optional />
                  <StyledInput value={activity.enddt} onChangeText={(v) => setActivity({ ...activity, enddt: v })} placeholder="12 May 2025 13:00" />
                </View>
              </View>
              <FieldLabel text="Confirmation #" optional />
              <StyledInput value={activity.confirmation} onChangeText={(v) => setActivity({ ...activity, confirmation: v })} placeholder="e.g. TKT-001" />
              <BookedToggle value={activity.booked} onChange={(v) => setActivity({ ...activity, booked: v })} />
              <FieldLabel text="Notes" optional />
              <StyledInput value={activity.notes} onChangeText={(v) => setActivity({ ...activity, notes: v })} placeholder="Any extra info…" multiline numberOfLines={3} />
            </>
          )}

          {/* ── TRANSPORT ── */}
          {itemType === 'transport' && (
            <>
              <FieldLabel text="Name" />
              <StyledInput value={transport.title} onChangeText={(v) => setTransport({ ...transport, title: v })} placeholder="e.g. Airport Express" />
              <FieldLabel text="Mode" optional />
              <TypePills
                options={[
                  { key: 'train', label: 'Train' }, { key: 'bus', label: 'Bus' },
                  { key: 'car', label: 'Car' }, { key: 'taxi', label: 'Taxi' },
                  { key: 'boat', label: 'Boat' }, { key: 'other', label: 'Other' },
                ]}
                value={transport.mode}
                onChange={(v) => setTransport({ ...transport, mode: v })}
                color={PLANNING_TYPE_CONFIG.transport.color}
              />
              <View style={styles.row}>
                <View style={styles.half}>
                  <FieldLabel text="From" optional />
                  <StyledInput value={transport.from} onChangeText={(v) => setTransport({ ...transport, from: v })} placeholder="e.g. Narita Airport" />
                </View>
                <View style={styles.half}>
                  <FieldLabel text="To" optional />
                  <StyledInput value={transport.to} onChangeText={(v) => setTransport({ ...transport, to: v })} placeholder="e.g. Shinjuku Station" />
                </View>
              </View>
              <FieldLabel text="Date / Time" optional />
              <StyledInput value={transport.datetime} onChangeText={(v) => setTransport({ ...transport, datetime: v })} placeholder="12 May 2025 09:30" />
              <View style={styles.row}>
                <View style={styles.half}>
                  <FieldLabel text="Seat / carriage" optional />
                  <StyledInput value={transport.seat} onChangeText={(v) => setTransport({ ...transport, seat: v })} placeholder="e.g. Car 4 Seat 12" />
                </View>
                <View style={styles.half}>
                  <FieldLabel text="Confirmation #" optional />
                  <StyledInput value={transport.confirmation} onChangeText={(v) => setTransport({ ...transport, confirmation: v })} placeholder="e.g. T-4521" />
                </View>
              </View>
              <FieldLabel text="Notes" optional />
              <StyledInput value={transport.notes} onChangeText={(v) => setTransport({ ...transport, notes: v })} placeholder="Any extra info…" multiline numberOfLines={3} />
            </>
          )}

          {/* ── OTHER ── */}
          {itemType === 'other' && (
            <>
              <FieldLabel text="Title" />
              <StyledInput value={other.title} onChangeText={(v) => setOther({ ...other, title: v })} placeholder="e.g. Buy travel insurance" />
              <FieldLabel text="Date / Time" optional />
              <StyledInput value={other.datetime} onChangeText={(v) => setOther({ ...other, datetime: v })} placeholder="12 May 2025 10:00" />
              <FieldLabel text="Notes" optional />
              <StyledInput value={other.notes} onChangeText={(v) => setOther({ ...other, notes: v })} placeholder="Any extra info…" multiline numberOfLines={3} />
            </>
          )}

          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: cfg.color }, saving && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.8}
          >
            <Text style={styles.saveBtnText}>{saving ? 'Saving…' : saveBtnLabel}</Text>
          </TouchableOpacity>
          <View style={{ height: 32 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const fs = StyleSheet.create({
  label: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    marginBottom: 5,
    marginTop: Spacing.sm,
  },
  optional: {
    fontWeight: '400' as const,
    color: Colors.textLight,
  },
  input: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 11,
    fontSize: FontSize.md,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  inputMulti: {
    minHeight: 80,
    textAlignVertical: 'top',
    paddingTop: 11,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  toggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toggleLabel: {
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: FontWeight.semibold,
  },
  optPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  optPillText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
  },
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    maxHeight: '90%',
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: Spacing.sm,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  sheetTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  sheetTitleIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheetTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  formContent: {
    paddingBottom: 16,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  half: {
    flex: 1,
  },
  typePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  typePillText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
  },
  nightsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    marginTop: Spacing.xs,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    backgroundColor: '#F0FDF4',
  },
  nightsText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  saveBtn: {
    borderRadius: BorderRadius.lg,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.white,
  },
});
