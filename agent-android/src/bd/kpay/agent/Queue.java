package bd.kpay.agent;
import android.content.*;
import android.database.Cursor;
import android.database.sqlite.*;
import org.json.JSONObject;
import java.util.*;

final class Queue extends SQLiteOpenHelper {
 Queue(Context c){super(c,"receipts.db",null,1);}
 public void onCreate(SQLiteDatabase d){d.execSQL("CREATE TABLE receipts(id TEXT PRIMARY KEY,fingerprint TEXT UNIQUE,payload TEXT,origin TEXT,captured INTEGER,state TEXT DEFAULT 'queued',attempts INTEGER DEFAULT 0,next_at INTEGER DEFAULT 0,result TEXT DEFAULT '',server_id TEXT DEFAULT '')");}
 public void onUpgrade(SQLiteDatabase d,int a,int b){throw new IllegalStateException("Queue migration required");}
 void add(JSONObject payload,String origin,long captured,String fingerprint,String state) throws Exception {
  ContentValues v=new ContentValues();v.put("id",payload.getString("client_event_id"));v.put("fingerprint",fingerprint);v.put("payload",Vault.encrypt(payload.toString()));v.put("origin",origin);v.put("captured",captured);v.put("state",state);
  getWritableDatabase().insertWithOnConflict("receipts",null,v,SQLiteDatabase.CONFLICT_IGNORE);
 }
 List<JSONObject> list(boolean pending){List<JSONObject> out=new ArrayList<>();String where=pending?"state='queued' AND next_at<="+System.currentTimeMillis():"1=1";try(Cursor c=getReadableDatabase().rawQuery("SELECT id,payload,origin,captured,state,attempts,result,server_id FROM receipts WHERE "+where+" ORDER BY captured "+(pending?"ASC LIMIT 50":"DESC LIMIT 200"),null)){while(c.moveToNext()){try{out.add(new JSONObject().put("id",c.getString(0)).put("payload",c.getString(1)).put("origin",c.getString(2)).put("captured",c.getLong(3)).put("state",c.getString(4)).put("attempts",c.getInt(5)).put("result",c.getString(6)).put("server_id",c.getString(7)));}catch(Exception e){throw new IllegalStateException(e);}}}return out;}
 boolean hasQueued(){try(Cursor c=getReadableDatabase().rawQuery("SELECT 1 FROM receipts WHERE state='queued' LIMIT 1",null)){return c.moveToFirst();}}
 int depth(){try(Cursor c=getReadableDatabase().rawQuery("SELECT COUNT(*) FROM receipts WHERE state IN ('queued','quarantined','review')",null)){c.moveToFirst();return c.getInt(0);}}
 void update(String id,String state,String result,String serverId,int attempts,long next){ContentValues v=new ContentValues();v.put("state",state);v.put("result",result);v.put("server_id",serverId);v.put("attempts",attempts);v.put("next_at",next);getWritableDatabase().update("receipts",v,"id=?",new String[]{id});}
 void retry(){getWritableDatabase().execSQL("UPDATE receipts SET next_at=0 WHERE state='queued'");}
}
