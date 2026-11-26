package org.cachymusic.app;

import android.content.Context;
import android.media.AudioFormat;
import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.net.Uri;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Streaming native audio decoder (MediaExtractor + MediaCodec -> raw PCM packets).
 * Decodes compressed Android local audio on native threads so Web Audio receives
 * linear PCM directly without passing through HTMLAudioElement or MediaPlayer.
 */
final class AndroidDirectDecoder {
    private static final int MAX_SESSIONS = 2;
    private static final int MIN_FRAMES = 1;
    private static final int MAX_FRAMES = 65536;
    private static final long CODEC_TIMEOUT_US = 5000L;
    private static final long READ_DEADLINE_MS = 2500L;

    static final class OpenResult {
        final String sessionId;
        final int sampleRate;
        final int channels;
        final long durationUs;
        final int pcmEncoding;
        final String mime;

        OpenResult(String sessionId, int sampleRate, int channels, long durationUs, int pcmEncoding, String mime) {
            this.sessionId = sessionId;
            this.sampleRate = sampleRate;
            this.channels = channels;
            this.durationUs = durationUs;
            this.pcmEncoding = pcmEncoding;
            this.mime = mime;
        }
    }

    private static final class Session {
        final String id;
        final MediaExtractor extractor;
        final MediaCodec codec;
        int sampleRate;
        int inChannels;
        int outChannels;
        int pcmEncoding;
        boolean inputEos;
        boolean outputEos;
        boolean closed;
        long skipUntilUs = -1L;
        byte[] leftover = new byte[0];
        int leftoverOffset = 0;

        Session(String id, MediaExtractor extractor, MediaCodec codec, int sampleRate, int inChannels, int pcmEncoding) {
            this.id = id;
            this.extractor = extractor;
            this.codec = codec;
            this.sampleRate = sampleRate;
            this.inChannels = Math.max(1, inChannels);
            this.outChannels = Math.min(2, this.inChannels);
            this.pcmEncoding = pcmEncoding;
        }

        int outFrameBytes() {
            return outChannels * (pcmEncoding == AudioFormat.ENCODING_PCM_FLOAT ? 4 : 2);
        }

        synchronized void release() {
            if (closed) return;
            closed = true;
            leftover = new byte[0];
            leftoverOffset = 0;
            try { codec.stop(); } catch (Exception ignored) {}
            try { codec.release(); } catch (Exception ignored) {}
            try { extractor.release(); } catch (Exception ignored) {}
        }
    }

    private final Map<String, Session> sessions = new LinkedHashMap<>(4, 0.75f, true);

    OpenResult open(Context ctx, Uri uri) throws IOException {
        if (ctx == null || uri == null) throw new IllegalArgumentException("Audio source required");
        MediaExtractor extractor = new MediaExtractor();
        MediaCodec codec = null;
        boolean handoffSucceeded = false;
        try {
            extractor.setDataSource(ctx, uri, null);
            int trackIndex = -1;
            MediaFormat format = null;
            String mime = null;
            int trackCount = extractor.getTrackCount();
            for (int i = 0; i < trackCount; i++) {
                MediaFormat candidate = extractor.getTrackFormat(i);
                String candidateMime = candidate.getString(MediaFormat.KEY_MIME);
                if (candidateMime != null && candidateMime.startsWith("audio/")) {
                    trackIndex = i;
                    format = candidate;
                    mime = candidateMime;
                    break;
                }
            }
            if (trackIndex < 0 || format == null || mime == null) {
                throw new IOException("No audio track found");
            }
            extractor.selectTrack(trackIndex);

            int sampleRate = format.containsKey(MediaFormat.KEY_SAMPLE_RATE)
                    ? format.getInteger(MediaFormat.KEY_SAMPLE_RATE) : 44100;
            int inChannels = format.containsKey(MediaFormat.KEY_CHANNEL_COUNT)
                    ? format.getInteger(MediaFormat.KEY_CHANNEL_COUNT) : 2;
            long durationUs = format.containsKey(MediaFormat.KEY_DURATION)
                    ? format.getLong(MediaFormat.KEY_DURATION) : 0L;

            codec = configureAudioCodec(extractor, trackIndex, mime);
            codec.start();

            int pcmEncoding = AudioFormat.ENCODING_PCM_16BIT;
            try {
                MediaFormat outFmt = codec.getOutputFormat();
                if (outFmt.containsKey(MediaFormat.KEY_SAMPLE_RATE)) {
                    sampleRate = outFmt.getInteger(MediaFormat.KEY_SAMPLE_RATE);
                }
                if (outFmt.containsKey(MediaFormat.KEY_CHANNEL_COUNT)) {
                    inChannels = outFmt.getInteger(MediaFormat.KEY_CHANNEL_COUNT);
                }
                if (outFmt.containsKey(MediaFormat.KEY_PCM_ENCODING)) {
                    pcmEncoding = outFmt.getInteger(MediaFormat.KEY_PCM_ENCODING);
                }
            } catch (Exception ignored) {}

            if (pcmEncoding != AudioFormat.ENCODING_PCM_FLOAT && pcmEncoding != AudioFormat.ENCODING_PCM_16BIT) throw new IOException("Unsupported PCM encoding");
            if (sampleRate < 8000 || sampleRate > 384000 || inChannels < 1 || inChannels > 2) {
                throw new IOException("Unsupported audio stream geometry");
            }

            String id = UUID.randomUUID().toString();
            Session session = new Session(id, extractor, codec, sampleRate, inChannels, pcmEncoding);
            Session evicted = null;
            synchronized (sessions) {
                if (sessions.size() >= MAX_SESSIONS) {
                    Iterator<Map.Entry<String, Session>> it = sessions.entrySet().iterator();
                    if (it.hasNext()) {
                        evicted = it.next().getValue();
                        it.remove();
                    }
                }
                sessions.put(id, session);
            }
            if (evicted != null) evicted.release();
            handoffSucceeded = true;
            return new OpenResult(id, session.sampleRate, session.outChannels, durationUs, session.pcmEncoding, mime);
        } finally {
            if (!handoffSucceeded) {
                if (codec != null) try { codec.release(); } catch (Exception ignored) {}
                try { extractor.release(); } catch (Exception ignored) {}
            }
        }
    }

    private static MediaCodec configureAudioCodec(MediaExtractor extractor, int trackIndex, String mime) throws IOException {
        MediaCodec codec = MediaCodec.createDecoderByType(mime);
        try {
            MediaFormat floatFmt = extractor.getTrackFormat(trackIndex);
            floatFmt.setInteger(MediaFormat.KEY_PCM_ENCODING, AudioFormat.ENCODING_PCM_FLOAT);
            codec.configure(floatFmt, null, null, 0);
            return codec;
        } catch (IllegalArgumentException | MediaCodec.CodecException floatRejected) {
            try { codec.release(); } catch (Exception ignored) {}
        }

        MediaCodec fallback = MediaCodec.createDecoderByType(mime);
        try {
            MediaFormat int16Fmt = extractor.getTrackFormat(trackIndex);
            int16Fmt.setInteger(MediaFormat.KEY_PCM_ENCODING, AudioFormat.ENCODING_PCM_16BIT);
            fallback.configure(int16Fmt, null, null, 0);
            return fallback;
        } catch (IllegalArgumentException | MediaCodec.CodecException int16WithKeyRejected) {
            // Some decoders reject explicit KEY_PCM_ENCODING and default to 16-bit PCM natively.
            try { fallback.release(); } catch (Exception ignored) {}
        }

        MediaFormat plainFormat = extractor.getTrackFormat(trackIndex);
        MediaCodec plain = MediaCodec.createDecoderByType(mime);
        try { plain.configure(plainFormat, null, null, 0); return plain; }
        catch (RuntimeException e) { try { plain.release(); } catch (Exception ignored) {} throw e; }
    }

    byte[] readChunk(String sessionId, long seekUs, int requestedFrames) throws IOException {
        Session session;
        synchronized (sessions) {
            session = sessions.get(sessionId);
        }
        if (session == null) return null;

        int maxFrames = Math.max(MIN_FRAMES, Math.min(MAX_FRAMES, requestedFrames));
        synchronized (session) {
            if (session.closed) return null;

            if (seekUs >= 0L) {
                session.extractor.seekTo(seekUs, MediaExtractor.SEEK_TO_PREVIOUS_SYNC);
                session.codec.flush();
                session.inputEos = false;
                session.outputEos = false;
                session.skipUntilUs = seekUs;
                session.leftover = new byte[0];
                session.leftoverOffset = 0;
            }

            int frameBytes = session.outFrameBytes();
            int targetBytes = maxFrames * frameBytes;
            ByteArrayOutputStream pcmOut = new ByteArrayOutputStream(Math.min(targetBytes, 262144));

            int leftoverAvail = session.leftover.length - session.leftoverOffset;
            if (leftoverAvail > 0) {
                int take = Math.min(leftoverAvail, targetBytes);
                pcmOut.write(session.leftover, session.leftoverOffset, take);
                session.leftoverOffset += take;
                if (session.leftoverOffset >= session.leftover.length) {
                    session.leftover = new byte[0];
                    session.leftoverOffset = 0;
                }
            }

            MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
            long deadline = System.currentTimeMillis() + READ_DEADLINE_MS;

            while (pcmOut.size() < targetBytes && !session.outputEos) {
                if (System.currentTimeMillis() > deadline) {
                    throw new IOException("PCM decode timeout");
                }
                boolean queuedInput = false;
                if (!session.inputEos) {
                    int inIdx = session.codec.dequeueInputBuffer(0L);
                    if (inIdx >= 0) {
                        queuedInput = true;
                        ByteBuffer inBuf = session.codec.getInputBuffer(inIdx);
                        if (inBuf != null) {
                            inBuf.clear();
                            int sampleSize = session.extractor.readSampleData(inBuf, 0);
                            if (sampleSize < 0) {
                                session.codec.queueInputBuffer(inIdx, 0, 0, 0L, MediaCodec.BUFFER_FLAG_END_OF_STREAM);
                                session.inputEos = true;
                            } else {
                                long pts = session.extractor.getSampleTime();
                                session.codec.queueInputBuffer(inIdx, 0, sampleSize, Math.max(0L, pts), 0);
                                session.extractor.advance();
                            }
                        }
                    }
                }

                int outIdx = session.codec.dequeueOutputBuffer(info, queuedInput ? 0L : 2000L);
                if (outIdx >= 0) {
                    ByteBuffer outBuf = session.codec.getOutputBuffer(outIdx);
                    if (outBuf != null && info.size > 0) {
                        outBuf.position(info.offset);
                        outBuf.limit(info.offset + info.size);
                        byte[] decoded = normalizePcmBuffer(outBuf, session, info.presentationTimeUs);
                        if (decoded.length > 0) {
                            int remaining = targetBytes - pcmOut.size();
                            int copyLen = Math.min(remaining, decoded.length);
                            pcmOut.write(decoded, 0, copyLen);
                            if (copyLen < decoded.length) {
                                int tail = decoded.length - copyLen;
                                session.leftover = new byte[tail];
                                System.arraycopy(decoded, copyLen, session.leftover, 0, tail);
                                session.leftoverOffset = 0;
                            }
                        }
                    }
                    session.codec.releaseOutputBuffer(outIdx, false);
                    if ((info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) {
                        session.outputEos = true;
                    }
                } else if (outIdx == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                    MediaFormat outFmt = session.codec.getOutputFormat();
                    int previousRate = session.sampleRate, previousChannels = session.inChannels, previousEncoding = session.pcmEncoding;
                    if (outFmt.containsKey(MediaFormat.KEY_SAMPLE_RATE)) {
                        session.sampleRate = outFmt.getInteger(MediaFormat.KEY_SAMPLE_RATE);
                    }
                    if (outFmt.containsKey(MediaFormat.KEY_CHANNEL_COUNT)) {
                        session.inChannels = outFmt.getInteger(MediaFormat.KEY_CHANNEL_COUNT);
                        session.outChannels = Math.min(2, session.inChannels);
                    }
                    if (outFmt.containsKey(MediaFormat.KEY_PCM_ENCODING)) {
                        session.pcmEncoding = outFmt.getInteger(MediaFormat.KEY_PCM_ENCODING);
                    }
                    if (session.pcmEncoding != AudioFormat.ENCODING_PCM_FLOAT && session.pcmEncoding != AudioFormat.ENCODING_PCM_16BIT) throw new IOException("Unsupported PCM encoding");
                    if (session.sampleRate < 8000 || session.sampleRate > 384000 || session.inChannels < 1 || session.inChannels > 2) throw new IOException("Invalid decoder format");
                    if ((pcmOut.size() > 0 || session.leftover.length > 0) && (previousRate != session.sampleRate || previousChannels != session.inChannels || previousEncoding != session.pcmEncoding)) {
                        throw new IOException("PCM format changed within a packet");
                    }
                    frameBytes = session.outFrameBytes();
                    targetBytes = maxFrames * frameBytes;
                }
            }

            byte[] payload = pcmOut.toByteArray();
            int validBytes = (payload.length / frameBytes) * frameBytes;
            int outFrames = validBytes / frameBytes;
            int flags = (session.pcmEncoding == AudioFormat.ENCODING_PCM_FLOAT ? 1 : 0)
                    | ((session.outputEos && session.leftover.length == 0) ? 2 : 0);

            ByteBuffer packet = ByteBuffer.allocate(16 + validBytes).order(ByteOrder.LITTLE_ENDIAN);
            packet.put((byte) 'C').put((byte) 'P').put((byte) 'C').put((byte) 'M');
            packet.putInt(session.sampleRate);
            packet.putShort((short) session.outChannels);
            packet.putShort((short) flags);
            packet.putInt(outFrames);
            if (validBytes > 0) packet.put(payload, 0, validBytes);
            return packet.array();
        }
    }

    private static byte[] normalizePcmBuffer(ByteBuffer buf, Session session, long ptsUs) {
        boolean isFloat = session.pcmEncoding == AudioFormat.ENCODING_PCM_FLOAT;
        int bytesPerSample = isFloat ? 4 : 2;
        int inFrameBytes = session.inChannels * bytesPerSample;
        int totalFrames = inFrameBytes > 0 ? (buf.remaining() / inFrameBytes) : 0;
        if (totalFrames <= 0) return new byte[0];

        int skipFrames = 0;
        if (session.skipUntilUs > 0L && ptsUs >= 0L) {
            if (ptsUs < session.skipUntilUs) {
                long deltaUs = session.skipUntilUs - ptsUs;
                if (deltaUs > 15_000_000L) {
                    session.skipUntilUs = -1L;
                } else {
                    long estSkip = (deltaUs * session.sampleRate) / 1_000_000L;
                    if (estSkip >= totalFrames) {
                        return new byte[0];
                    }
                    skipFrames = (int) Math.max(0L, estSkip);
                }
            }
            session.skipUntilUs = -1L;
        }

        if (skipFrames > 0) {
            buf.position(buf.position() + skipFrames * inFrameBytes);
            totalFrames -= skipFrames;
        }
        if (totalFrames <= 0) return new byte[0];

        if (session.inChannels == session.outChannels) {
            byte[] direct = new byte[totalFrames * inFrameBytes];
            buf.get(direct);
            return direct;
        }

        // Downmix >2ch surround tracks cleanly to stereo in the matching sample format.
        ByteBuffer src = buf.slice().order(ByteOrder.LITTLE_ENDIAN);
        int outFrameBytes = 2 * bytesPerSample;
        ByteBuffer dst = ByteBuffer.allocate(totalFrames * outFrameBytes).order(ByteOrder.LITTLE_ENDIAN);
        int inCh = session.inChannels;
        int evenCount = (inCh + 1) / 2;
        int oddCount = inCh / 2;
        float invEven = evenCount > 0 ? (1.0f / evenCount) : 1.0f;
        float invOdd = oddCount > 0 ? (1.0f / oddCount) : 1.0f;

        if (isFloat) {
            for (int f = 0; f < totalFrames; f++) {
                float sumL = 0f, sumR = 0f;
                for (int c = 0; c < inCh; c++) {
                    float v = src.getFloat();
                    if ((c & 1) == 0) sumL += v;
                    else sumR += v;
                }
                dst.putFloat(sumL * invEven);
                dst.putFloat(sumR * invOdd);
            }
        } else {
            for (int f = 0; f < totalFrames; f++) {
                int sumL = 0, sumR = 0;
                for (int c = 0; c < inCh; c++) {
                    short v = src.getShort();
                    if ((c & 1) == 0) sumL += v;
                    else sumR += v;
                }
                int l = Math.max(-32768, Math.min(32767, Math.round(sumL * invEven)));
                int r = Math.max(-32768, Math.min(32767, Math.round(sumR * invOdd)));
                dst.putShort((short) l);
                dst.putShort((short) r);
            }
        }
        return dst.array();
    }

    void close(String sessionId) {
        if (sessionId == null || sessionId.isEmpty()) return;
        Session removed;
        synchronized (sessions) {
            removed = sessions.remove(sessionId);
        }
        if (removed != null) removed.release();
    }

    void closeAll() {
        Session[] all;
        synchronized (sessions) {
            all = sessions.values().toArray(new Session[0]);
            sessions.clear();
        }
        for (Session s : all) s.release();
    }
}
