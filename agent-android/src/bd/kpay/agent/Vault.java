package bd.kpay.agent;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.spec.ECGenParameterSpec;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;

final class Vault {
 static KeyStore store() throws Exception { KeyStore k=KeyStore.getInstance("AndroidKeyStore");k.load(null);return k; }
 static synchronized void init() throws Exception {
  KeyStore k=store();
  if(!k.containsAlias("kpay-data")){KeyGenerator g=KeyGenerator.getInstance("AES","AndroidKeyStore");g.init(new KeyGenParameterSpec.Builder("kpay-data",KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes("GCM").setEncryptionPaddings("NoPadding").build());g.generateKey();}
  if(!k.containsAlias("kpay-device")){KeyPairGenerator g=KeyPairGenerator.getInstance("EC","AndroidKeyStore");g.initialize(new KeyGenParameterSpec.Builder("kpay-device",KeyProperties.PURPOSE_SIGN|KeyProperties.PURPOSE_VERIFY).setAlgorithmParameterSpec(new ECGenParameterSpec("secp256r1")).setDigests("SHA-256").build());g.generateKeyPair();}
 }
 static String encrypt(String s) throws Exception {init();Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.ENCRYPT_MODE,store().getKey("kpay-data",null));return b64(c.getIV())+":"+b64(c.doFinal(s.getBytes(StandardCharsets.UTF_8)));}
 static String decrypt(String s) throws Exception {String[] p=s.split(":");Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.DECRYPT_MODE,store().getKey("kpay-data",null),new GCMParameterSpec(128,Base64.decode(p[0],0)));return new String(c.doFinal(Base64.decode(p[1],0)),StandardCharsets.UTF_8);}
 static String publicKey() throws Exception {init();return b64(store().getCertificate("kpay-device").getPublicKey().getEncoded());}
 static String sign(String text) throws Exception {init();Signature s=Signature.getInstance("SHA256withECDSA");s.initSign((PrivateKey)store().getKey("kpay-device",null));s.update(text.getBytes(StandardCharsets.UTF_8));return b64(s.sign());}
 static String b64(byte[] b){return Base64.encodeToString(b,Base64.NO_WRAP);}
 static String hash(String s) throws Exception {byte[] bytes=MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8));StringBuilder r=new StringBuilder();for(byte b:bytes)r.append(String.format("%02x",b&255));return r.toString();}
 static void save(Context c,String name,String value) throws Exception {if(!c.getSharedPreferences("vault",0).edit().putString(name,encrypt(value)).commit())throw new Exception("Device storage is full");}
 static String get(Context c,String name) throws Exception {String s=c.getSharedPreferences("vault",0).getString(name,null);return s==null?"":decrypt(s);}
}
