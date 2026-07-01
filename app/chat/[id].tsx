import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts';
import { Colors, FontSize, FontWeight, Spacing, BorderRadius } from '../../src/constants';
import {
  fetchMessagesPaged,
  fetchUserProfile,
  sendMessage,
  subscribeToMessages,
  type ConversationUser,
  type Message,
} from '../../src/services/chat';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../../src/lib/supabase';

export default function ChatScreen() {
  const { id: conversationId, otherUserId } = useLocalSearchParams<{ id: string; otherUserId?: string }>();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [otherUser, setOtherUser] = useState<ConversationUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const oldestCursorRef = useRef<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [rateLimitError, setRateLimitError] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const load = useCallback(async () => {
    if (!conversationId || !user) return;
    const page = await fetchMessagesPaged(conversationId, null, 20);
    setMessages(page.items);
    oldestCursorRef.current = page.nextCursor;
    setHasMore(page.hasMore);
    setLoading(false);

    if (otherUserId) {
      const profile = await fetchUserProfile(otherUserId);
      setOtherUser(profile);
    }
  }, [conversationId, user, otherUserId]);

  const loadOlderMessages = useCallback(async () => {
    if (!conversationId || loadingMore || !hasMore || !oldestCursorRef.current) return;
    setLoadingMore(true);
    const page = await fetchMessagesPaged(conversationId, oldestCursorRef.current, 20);
    setMessages((prev) => [...page.items, ...prev]);
    oldestCursorRef.current = page.nextCursor;
    setHasMore(page.hasMore);
    setLoadingMore(false);
  }, [conversationId, loadingMore, hasMore]);

  useEffect(() => {
    load();

    if (conversationId) {
      channelRef.current = subscribeToMessages(conversationId, (msg) => {
        setMessages((prev) => {
          if (prev.find((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
      });
    }

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [conversationId, load]);

  useEffect(() => {
    if (messages.length > 0 && !loading) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 100);
    }
  }, [loading]);

  const handleSend = async () => {
    if (!text.trim() || !conversationId || !user || sending) return;
    const content = text.trim();
    setText('');
    setSending(true);
    setRateLimitError(false);
    const result = await sendMessage(conversationId, user.id, content);
    if (result.rateLimited) {
      setRateLimitError(true);
      setTimeout(() => setRateLimitError(false), 3000);
    }
    setSending(false);
  };

  const getDisplayName = () =>
    otherUser?.full_name ?? otherUser?.username ?? 'Traveller';

  const getInitials = () =>
    (otherUser?.full_name ?? otherUser?.username ?? 'T').slice(0, 1).toUpperCase();

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const isMe = item.sender_id === user?.id;
    const prevItem = messages[index - 1];
    const showTime =
      !prevItem ||
      new Date(item.created_at).getTime() - new Date(prevItem.created_at).getTime() > 5 * 60 * 1000;

    return (
      <View>
        {showTime ? (
          <Text style={styles.timeLabel}>{formatTime(item.created_at)}</Text>
        ) : null}
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
          <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMe : styles.bubbleTextThem]}>
            {item.content}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      {/* ── Header ── */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </Pressable>

        {otherUser?.avatar_url ? (
          <Image source={{ uri: otherUser.avatar_url }} style={styles.headerAvatar} />
        ) : (
          <View style={styles.headerAvatarPlaceholder}>
            <Text style={styles.headerAvatarInitial}>{getInitials()}</Text>
          </View>
        )}

        <View style={styles.headerInfo}>
          <Text style={styles.headerName} numberOfLines={1}>{getDisplayName()}</Text>
          <Text style={styles.headerSub}>Private message</Text>
        </View>
      </View>

      {/* ── Messages ── */}
      {loading ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
          onEndReachedThreshold={0.1}
          onEndReached={loadOlderMessages}
          ListHeaderComponent={
            loadingMore
              ? () => <ActivityIndicator size="small" color={Colors.primary} style={{ paddingVertical: 8 }} />
              : null
          }
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <Ionicons name="chatbubble-ellipses-outline" size={48} color={Colors.textLight} />
              <Text style={styles.emptyChatText}>
                Say hello to {getDisplayName()}!
              </Text>
            </View>
          }
        />
      )}

      {rateLimitError && (
        <View style={styles.rateLimitBanner}>
          <Ionicons name="warning-outline" size={16} color={Colors.white} />
          <Text style={styles.rateLimitText}>Too many messages. Please slow down.</Text>
        </View>
      )}

      {/* ── Input bar ── */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          placeholder="Type a message…"
          placeholderTextColor={Colors.textLight}
          value={text}
          onChangeText={setText}
          multiline
          maxLength={2000}
          returnKeyType="default"
        />
        <Pressable
          style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!text.trim() || sending}
        >
          {sending
            ? <ActivityIndicator size="small" color={Colors.white} />
            : <Ionicons name="send" size={18} color={Colors.white} />}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  /* ── Header ── */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingTop: Platform.OS === 'ios' ? 60 : 20,
    paddingBottom: Spacing.md,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  headerAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary + '22',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerAvatarInitial: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
  },
  headerInfo: {
    flex: 1,
  },
  headerName: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  headerSub: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },

  /* ── Messages list ── */
  loadingCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messagesList: {
    padding: Spacing.md,
    gap: 4,
    flexGrow: 1,
  },
  emptyChat: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingTop: 80,
  },
  emptyChatText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  timeLabel: {
    textAlign: 'center',
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginVertical: 8,
  },

  /* ── Bubbles ── */
  bubble: {
    maxWidth: '78%',
    borderRadius: BorderRadius.lg,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginVertical: 2,
  },
  bubbleMe: {
    backgroundColor: Colors.primary,
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  bubbleThem: {
    backgroundColor: Colors.card,
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  bubbleTextMe: {
    color: Colors.white,
  },
  bubbleTextThem: {
    color: Colors.text,
  },

  /* ── Input bar ── */
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingBottom: Platform.OS === 'ios' ? 28 : Spacing.md,
    backgroundColor: Colors.white,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: FontSize.sm,
    color: Colors.text,
    maxHeight: 120,
    backgroundColor: '#FAFBFC',
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
  rateLimitBanner: {
    position: 'absolute',
    bottom: 90,
    left: Spacing.md,
    right: Spacing.md,
    backgroundColor: '#EF4444',
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  rateLimitText: {
    color: Colors.white,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    flex: 1,
  },
});
