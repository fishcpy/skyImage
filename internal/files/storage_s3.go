package files

import (
	"bytes"
	"context"
	"crypto/md5"
	"crypto/sha1"
	"fmt"
	"io"
	"net/url"
	"os"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"

	"skyimage/internal/data"
)

func (s *Service) storeS3Object(ctx context.Context, cfg strategyConfig, relativePath string, head []byte, remain io.Reader) (storeObjectResult, error) {
	if strings.TrimSpace(cfg.S3Bucket) == "" {
		return storeObjectResult{}, fmt.Errorf("s3 bucket is required")
	}
	key := joinRelativePath(cfg.Root, relativePath)
	key = sanitizeRelativePath(key)
	if key == "" {
		return storeObjectResult{}, fmt.Errorf("s3 object key is empty")
	}

	client, err := newS3Client(ctx, cfg)
	if err != nil {
		return storeObjectResult{}, err
	}

	tmp, err := os.CreateTemp("", "skyimage-s3-*")
	if err != nil {
		return storeObjectResult{}, err
	}
	tmpPath := tmp.Name()
	defer func() {
		_ = tmp.Close()
		_ = os.Remove(tmpPath)
	}()

	md5Hasher := md5.New()
	sha1Hasher := sha1.New()

	var reader io.Reader
	if remain != nil {
		reader = io.MultiReader(bytes.NewReader(head), remain)
	} else {
		reader = bytes.NewReader(head)
	}
	size, err := io.Copy(tmp, io.TeeReader(reader, io.MultiWriter(md5Hasher, sha1Hasher)))
	if err != nil {
		return storeObjectResult{}, err
	}
	if _, err := tmp.Seek(0, io.SeekStart); err != nil {
		return storeObjectResult{}, err
	}

	_, err = client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:        aws.String(cfg.S3Bucket),
		Key:           aws.String(key),
		Body:          tmp,
		ContentLength: aws.Int64(size),
	})
	if err != nil {
		return storeObjectResult{}, err
	}

	return storeObjectResult{
		Path: key,
		Size: size,
		MD5:  md5Hasher.Sum(nil),
		SHA1: sha1Hasher.Sum(nil),
	}, nil
}

func (s *Service) deleteS3Object(ctx context.Context, cfg strategyConfig, file data.FileAsset) error {
	if strings.TrimSpace(cfg.S3Bucket) == "" {
		return fmt.Errorf("s3 bucket is required")
	}
	key := s.s3ObjectKey(cfg, file)
	if key == "" {
		return fmt.Errorf("s3 object key is empty")
	}
	client, err := newS3Client(ctx, cfg)
	if err != nil {
		return err
	}
	_, err = client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(cfg.S3Bucket),
		Key:    aws.String(key),
	})
	return err
}

func (s *Service) fetchS3Object(ctx context.Context, cfg strategyConfig, file data.FileAsset) (*ProxyObject, error) {
	if strings.TrimSpace(cfg.S3Bucket) == "" {
		return nil, fmt.Errorf("s3 bucket is required")
	}
	key := s.s3ObjectKey(cfg, file)
	if key == "" {
		return nil, fmt.Errorf("s3 object key is empty")
	}
	client, err := newS3Client(ctx, cfg)
	if err != nil {
		return nil, err
	}
	out, err := client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(cfg.S3Bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return nil, err
	}

	proxy := &ProxyObject{
		Body: out.Body,
	}
	if out.ContentType != nil {
		proxy.ContentType = strings.TrimSpace(*out.ContentType)
	}
	if out.ContentLength != nil {
		proxy.ContentLength = *out.ContentLength
	}
	if out.CacheControl != nil {
		proxy.CacheControl = strings.TrimSpace(*out.CacheControl)
	}
	if out.ETag != nil {
		proxy.ETag = strings.TrimSpace(*out.ETag)
	}
	if out.LastModified != nil {
		proxy.LastModified = out.LastModified
	}
	return proxy, nil
}

func (s *Service) s3ObjectKey(cfg strategyConfig, file data.FileAsset) string {
	if trimmed := sanitizeRelativePath(strings.TrimSpace(file.Path)); trimmed != "" {
		return trimmed
	}
	if trimmed := sanitizeRelativePath(strings.TrimSpace(file.RelativePath)); trimmed != "" {
		return joinRelativePath(cfg.Root, trimmed)
	}
	return sanitizeRelativePath(strings.TrimSpace(file.Name))
}

func newS3Client(ctx context.Context, cfg strategyConfig) (*s3.Client, error) {
	region := strings.TrimSpace(cfg.S3Region)
	if region == "" {
		region = "us-east-1"
	}
	accessKey := strings.TrimSpace(cfg.S3AccessKey)
	secretKey := strings.TrimSpace(cfg.S3SecretKey)
	if accessKey == "" || secretKey == "" {
		return nil, fmt.Errorf("s3 access key and secret key are required")
	}

	opts := []func(*config.LoadOptions) error{
		config.WithRegion(region),
		config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
			accessKey,
			secretKey,
			strings.TrimSpace(cfg.S3SessionToken),
		)),
		config.WithRequestChecksumCalculation(aws.RequestChecksumCalculationWhenRequired),
		config.WithResponseChecksumValidation(aws.ResponseChecksumValidationWhenRequired),
	}

	endpoint := normalizeS3Endpoint(cfg.S3Endpoint)
	awsCfg, err := config.LoadDefaultConfig(ctx, opts...)
	if err != nil {
		return nil, err
	}
	return s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		if endpoint != "" {
			o.BaseEndpoint = aws.String(endpoint)
		}
		o.UsePathStyle = cfg.S3ForcePathStyle
	}), nil
}

func normalizeS3Endpoint(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return ""
	}
	if strings.HasPrefix(trimmed, "//") {
		return "https:" + trimmed
	}
	lower := strings.ToLower(trimmed)
	if strings.HasPrefix(lower, "http://") || strings.HasPrefix(lower, "https://") {
		if _, err := url.Parse(trimmed); err == nil {
			return trimmed
		}
	}
	candidate := "https://" + trimmed
	if _, err := url.Parse(candidate); err == nil {
		return candidate
	}
	if _, err := url.Parse(trimmed); err == nil {
		return trimmed
	}
	return ""
}
